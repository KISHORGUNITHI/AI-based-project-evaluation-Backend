import type { GithubProject } from "../types/github.types";
import type { RepoMetrics } from "../langgraph/types.js";

const MAX_README        = 1000;  // trimmed — 8B context is limited
const MAX_FILE_PREVIEW  = 400;   // enough to see function signatures and logic
const MAX_FILES_TOTAL   = 15;    // fewer files keeps prompt within 8B context
const MAX_FOLDER_LINES  = 60;
const MIN_FILE_LINES    = 5;     // skip near-empty files (just imports/blank lines)

// ─── Pre-LLM metrics extraction ──────────────────────────────────────────────

/**
 * Derives hard facts from the parsed repo without any LLM call.
 * These ground the LLM prompt so it can't hallucinate basic stats.
 */
export function extractRepoMetrics(project: GithubProject): RepoMetrics {
    const files = project.files;

    // Language breakdown by file count
    const langCount: Record<string, number> = {};
    for (const f of files) {
        langCount[f.extension] = (langCount[f.extension] ?? 0) + 1;
    }

    // Test file detection: files whose path contains test/spec/__test__
    const testFiles = files.filter(f =>
        /[/\\]?(__tests__|tests?|spec)[/\\]/i.test(f.path) ||
        /\.(test|spec)\.[a-z]+$/i.test(f.path) ||
        /test_[a-z]/i.test(f.path)
    );
    const testFileRatio = files.length > 0 ? testFiles.length / files.length : 0;

    // Average file size in lines
    const totalLines = files.reduce((sum, f) => sum + f.content.split("\n").length, 0);
    const avgFileSizeLines = files.length > 0 ? Math.round(totalLines / files.length) : 0;

    // Project maturity signals (check folder structure, not just parsed files)
    const allPaths = project.folderStructure.map(p => p.toLowerCase());
    const hasDockerfile   = allPaths.some(p => /^dockerfile$|\/dockerfile$/i.test(p));
    const hasCiConfig     = allPaths.some(p => /\.github[/\\]workflows|\.gitlab-ci|bitbucket-pipelines|\.circleci/i.test(p));
    const hasEnvExample   = allPaths.some(p => /\.env\.example|\.env\.sample/i.test(p));
    const hasLintConfig   = allPaths.some(p => /\.eslintrc|ruff\.toml|\.flake8|biome\.json|\.pylintrc|\.prettierrc/i.test(p));
    const notebookCount   = files.filter(f => f.path.endsWith(".ipynb")).length;

    return {
        totalFiles: files.length,
        languageBreakdown: langCount,
        testFileRatio: Math.round(testFileRatio * 100) / 100,
        hasDockerfile,
        hasCiConfig,
        hasEnvExample,
        hasLintConfig,
        notebookCount,
        avgFileSizeLines,
    };
}

// ─── Smart file sampling ─────────────────────────────────────────────────────

/**
 * Scores each file to pick the most informative ones.
 * Favours: ML entry points, actual logic files, larger meaningful files.
 * Penalises: near-empty files, config-only files, generated files.
 */
function scoreFile(filePath: string, content: string): number {
    const lines = content.split("\n").length;
    if (lines < MIN_FILE_LINES) return -1; // discard near-empty files

    let score = 0;

    // ML/AI core files — highest value for evaluation
    if (/train|model|predict|inference|dataset|pipeline|neural|cnn|rnn|lstm|transformer|bert|gpt|embedding|classifier|regressor/i.test(filePath)) score += 60;
    if (filePath.endsWith(".ipynb")) score += 50;
    if (/requirements.*\.txt$|setup\.py$|pyproject\.toml$/i.test(filePath)) score += 40;

    // Backend entry points and core logic
    if (/index\.(ts|js|py)|main\.(ts|js|py)|app\.(ts|js|py)|server\.(ts|js)/i.test(filePath)) score += 35;
    if (/route|controller|service|handler|middleware/i.test(filePath)) score += 30;
    if (/schema|model|entity|repository/i.test(filePath)) score += 25;

    // Agent/AI orchestration
    if (/agent|graph|chain|node|tool|prompt|rag|vector/i.test(filePath)) score += 40;

    // Frontend components
    if (/component|page|view|screen/i.test(filePath)) score += 20;

    // Test files — useful for knowing test quality
    if (/test|spec/i.test(filePath)) score += 15;

    // Config files — low value, just a little
    if (/config|settings|env/i.test(filePath)) score += 5;

    // Reward files with real content (more lines = more to analyse), capped
    score += Math.min(lines / 10, 20);

    return score;
}

function sampleFiles(files: GithubProject["files"], maxTotal: number): GithubProject["files"] {
    if (files.length <= maxTotal) return files;

    // Score and sort all files
    const scored = files
        .map(f => ({ file: f, score: scoreFile(f.path, f.content) }))
        .filter(({ score }) => score >= 0)  // drop near-empty
        .sort((a, b) => b.score - a.score);

    // Always take top-scored overall, but ensure we cover multiple top-level dirs
    const byDir = new Map<string, typeof scored>();
    for (const item of scored) {
        const dir = item.file.path.split("/")[0] ?? "root";
        if (!byDir.has(dir)) byDir.set(dir, []);
        byDir.get(dir)!.push(item);
    }

    const result: GithubProject["files"] = [];
    const dirs = [...byDir.keys()];

    // First pass: take best file from each directory (ensures coverage)
    for (const dir of dirs) {
        const best = byDir.get(dir)![0];
        if (best) result.push(best.file);
    }

    // Second pass: fill remaining slots with globally highest-scoring files not already added
    const added = new Set(result.map(f => f.path));
    for (const { file } of scored) {
        if (result.length >= maxTotal) break;
        if (!added.has(file.path)) {
            result.push(file);
            added.add(file.path);
        }
    }

    return result.slice(0, maxTotal);
}

// ─── README smart truncation ─────────────────────────────────────────────────

/**
 * Strips badge/shield lines from README and returns the meaningful content.
 * Badge lines are noise — they don't describe what the project does.
 */
function cleanReadme(readme: string, maxLen: number): string {
    const lines = readme.split("\n");
    const cleaned = lines.filter(line => {
        const stripped = line.trim();
        // Skip blank badge-only lines (shields.io, img.shields, badge URLs)
        if (/!\[.*\]\(https?:\/\/(img\.shields\.io|shields\.io|badge\.fury|travis-ci|circleci|codecov|github\.com\/.*\/badge)/i.test(stripped)) return false;
        return true;
    });
    return cleaned.join("\n").replace(/\n{3,}/g, "\n\n").slice(0, maxLen);
}

// ─── Package.json smart extraction ───────────────────────────────────────────

function extractPackageJsonSummary(raw: string): string {
    try {
        const pkg = JSON.parse(raw);
        const relevant: Record<string, unknown> = {};
        if (pkg.name)         relevant.name = pkg.name;
        if (pkg.description)  relevant.description = pkg.description;
        if (pkg.scripts)      relevant.scripts = pkg.scripts;
        if (pkg.dependencies) relevant.dependencies = pkg.dependencies;
        if (pkg.devDependencies) relevant.devDependencies = pkg.devDependencies;
        return JSON.stringify(relevant, null, 2).slice(0, 800);
    } catch {
        return raw.replace(/\s+/g, " ").slice(0, 800);
    }
}

// ─── Main summary generator ──────────────────────────────────────────────────

export class GithubSummaryService {
    generateSummary(project: GithubProject): string {
        const metrics = extractRepoMetrics(project);

        const readme = project.readme
            ? cleanReadme(project.readme, MAX_README)
            : "No README found.";

        const packageJsonSummary = project.packageJson
            ? extractPackageJsonSummary(project.packageJson)
            : "No package.json found.";

        // Python dependency files
        const requirementsFile = project.files.find(f =>
            /requirements.*\.txt$/i.test(f.path) || f.path === "requirements.txt"
        );
        const requirements = requirementsFile
            ? requirementsFile.content.replace(/\s+/g, " ").slice(0, 600)
            : null;

        const setupFile = project.files.find(f =>
            /setup\.py$|pyproject\.toml$|setup\.cfg$/i.test(f.path)
        );
        const setup = setupFile
            ? setupFile.content.replace(/\s+/g, " ").slice(0, 400)
            : null;

        // Smart file sampling
        const sampled = sampleFiles(project.files, MAX_FILES_TOTAL);
        const importantFiles = sampled
            .map(file => {
                const lineCount = file.content.split("\n").length;
                const preview = file.content.slice(0, MAX_FILE_PREVIEW);
                const truncated = file.content.length > MAX_FILE_PREVIEW ? "\n... (truncated)" : "";
                return `File: ${file.path} (${lineCount} lines)\n${preview}${truncated}`;
            })
            .join("\n\n---\n\n");

        const folderStructure = project.folderStructure
            .slice(0, MAX_FOLDER_LINES)
            .join("\n");

        // Top-level dirs for quick orientation
        const topDirs = [...new Set(
            project.folderStructure.map(p => p.split(/[/\\]/)[0]).filter(Boolean)
        )].join(", ");

        // Format metrics as readable facts for the LLM
        const langBreakdown = Object.entries(metrics.languageBreakdown)
            .sort((a, b) => b[1] - a[1])
            .map(([ext, count]) => `${ext}: ${count} files`)
            .join(", ");

        const metricsBlock = [
            `Total source files: ${metrics.totalFiles}`,
            `Languages: ${langBreakdown || "N/A"}`,
            `Jupyter notebooks: ${metrics.notebookCount}`,
            `Test file ratio: ${(metrics.testFileRatio * 100).toFixed(0)}% of files are tests`,
            `Average file size: ${metrics.avgFileSizeLines} lines`,
            `Has Dockerfile: ${metrics.hasDockerfile}`,
            `Has CI/CD config: ${metrics.hasCiConfig}`,
            `Has .env.example: ${metrics.hasEnvExample}`,
            `Has lint config: ${metrics.hasLintConfig}`,
        ].join("\n");

        const parts = [
            `Repository: ${project.repositoryName}`,
            `Top-level directories: ${topDirs || "N/A"}`,
            `\n=== REPOSITORY METRICS (pre-computed facts) ===\n${metricsBlock}`,
            `\n=== README ===\n${readme}`,
            `\n=== package.json (key fields) ===\n${packageJsonSummary}`,
        ];

        if (requirements) parts.push(`\n=== requirements.txt ===\n${requirements}`);
        if (setup)        parts.push(`\n=== ${setupFile!.path} ===\n${setup}`);

        parts.push(
            `\n=== Folder Structure (top ${MAX_FOLDER_LINES} paths) ===\n${folderStructure}`,
            `\n=== Key Source Files (${sampled.length} files, scored by importance) ===\n${importantFiles}`,
        );

        return parts.join("\n");
    }
}
