import fs from "fs";
import path from "path";
import { FileTraverser } from "../utils/file-traverser";
import { ALLOWED_EXTENSIONS } from "./github-ignore";
import type { GithubProject, RepositoryFile } from "../types/github.types";

const MAX_FILE_SIZE_BYTES = 150_000; // skip files > 150 KB (minified bundles, large data files, etc.)

export class GithubParserService {
    private traverser = new FileTraverser();

    async parseRepository(repositoryPath: string): Promise<GithubProject> {
        const allFiles: string[] = this.traverser.traverse(repositoryPath);
        const parsedFiles: RepositoryFile[] = [];
        let readme = "";
        let packageJson = "";

        const folderStructure = allFiles.map((file: string) =>
            path.relative(repositoryPath, file)
        );

        for (const file of allFiles) {
            const extension = path.extname(file);
            const fileName = path.basename(file);

            if (!ALLOWED_EXTENSIONS.includes(extension)) continue;

            // Skip oversized files (minified JS, large data dumps, generated files)
            let stat: fs.Stats;
            try {
                stat = fs.statSync(file);
            } catch {
                continue;
            }
            if (stat.size > MAX_FILE_SIZE_BYTES) {
                console.log(`[githubParser] Skipping large file (${Math.round(stat.size / 1024)}KB): ${path.relative(repositoryPath, file)}`);
                continue;
            }

            let content: string;
            try {
                content = fs.readFileSync(file, "utf8");
            } catch {
                // Binary file disguised as a text extension — skip
                continue;
            }

            if (fileName.toLowerCase() === "readme.md") {
                readme = content;
            }

            if (fileName === "package.json") {
                packageJson = content;
            }

            parsedFiles.push({
                path: path.relative(repositoryPath, file),
                extension,
                content,
            });
        }

        return {
            repositoryName: path.basename(repositoryPath),
            folderStructure,
            readme,
            packageJson,
            files: parsedFiles,
        };
    }
}