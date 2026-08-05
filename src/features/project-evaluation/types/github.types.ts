export interface RepositoryFile {
    path: string;
    extension: string;
    content: string;
}

export interface GithubProject {
    repositoryName: string;
    folderStructure: string[];
    readme: string;
    packageJson: string;
    files: RepositoryFile[];
}