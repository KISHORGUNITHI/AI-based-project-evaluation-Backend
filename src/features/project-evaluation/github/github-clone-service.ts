import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

const execAsync = promisify(exec);

/**
 * Parses a GitHub URL which may be:
 *   - https://github.com/user/repo
 *   - https://github.com/user/repo.git
 *   - https://github.com/user/repo/tree/branch
 *   - https://github.com/user/repo/tree/branch/subdir
 *
 * Returns { repoUrl, branch } where repoUrl always ends in .git
 */
function parseGithubUrl(raw: string): { repoUrl: string; branch?: string } {
    try {
        const url = new URL(raw);
        const parts = url.pathname.replace(/^\//, "").split("/");
        // parts[0] = user, parts[1] = repo, parts[2] = "tree", parts[3] = branch
        const user = parts[0];
        const repo = parts[1]?.replace(/\.git$/, "");
        const branch = parts[2] === "tree" ? parts[3] : undefined;

        const repoUrl = `https://github.com/${user}/${repo}.git`;
        return { repoUrl, branch };
    } catch {
        // Not a parseable URL — use as-is
        return { repoUrl: raw };
    }
}

export class GithubCloneService {
    async cloneRepository(repositoryUrl: string): Promise<string> {
        const tempDirectory = path.join(process.cwd(), "temp");
        if (!fs.existsSync(tempDirectory)) {
            fs.mkdirSync(tempDirectory, { recursive: true });
        }

        const clonePath = path.join(tempDirectory, `repo-${Date.now()}`);
        const { repoUrl, branch } = parseGithubUrl(repositoryUrl);

        const token = process.env.GITHUB_TOKEN;
        const authedRepoUrl = token
            ? repoUrl.replace("https://", `https://${token}@`)
            : repoUrl;

        const branchFlag = branch ? `--branch "${branch}"` : "";
        const cmd = `git clone --depth 1 ${branchFlag} "${authedRepoUrl}" "${clonePath}"`;

        // Log without exposing the token
        console.log(`[GithubCloneService] Running: git clone --depth 1 ${branchFlag} "${repoUrl}" "${clonePath}"`);

        // 60-second timeout so a slow/unreachable repo doesn't hang indefinitely
        const { stdout, stderr } = await execAsync(cmd, { timeout: 60_000 });
        if (stderr && !stderr.toLowerCase().includes("cloning into")) {
            // git writes normal progress to stderr — only log if it looks like a real warning
            console.warn(`[GithubCloneService] git stderr: ${stderr.slice(0, 300)}`);
        }
        console.log(`[GithubCloneService] Clone complete → ${clonePath}`);
        return clonePath;
    }

    async deleteRepository(repositoryPath: string): Promise<void> {
        if (fs.existsSync(repositoryPath)) {
            fs.rmSync(repositoryPath, { recursive: true, force: true });
        }
    }
}
