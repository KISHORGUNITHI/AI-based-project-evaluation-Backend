import fs from "fs";
import path from "path";
import {IGNORED_DIRECTORIES,IGNORED_FILES} from "../github/github-ignore";

export class FileTraverser {
    traverse(directory: string): string[] {
        let files: string[] = [];
        const entries = fs.readdirSync(directory);

        for (const entry of entries) {
            if(IGNORED_DIRECTORIES.includes(entry)||IGNORED_FILES.includes(entry)){
                continue;
            }
            const fullPath = path.join(directory, entry);
            const stats = fs.statSync(fullPath);

            if (stats.isDirectory()){
                files.push(...this.traverse(fullPath));
            } 
            else{
                files.push(fullPath);
            }
        }
       return files;
    }
}