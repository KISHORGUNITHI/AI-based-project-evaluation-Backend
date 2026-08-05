export const IGNORED_DIRECTORIES=[
    "node_modules",
    ".git",
    "dist",
    "build",
    ".next",
    "coverage",
    "__pycache__",
    ".ipynb_checkpoints",
    "venv",
    ".venv",
    "env",
    "mlruns",
    "wandb",
];
export const IGNORED_FILES=[
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    ".env",
    ".env.local"
];
export const ALLOWED_EXTENSIONS=[
    // Web
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".json",
    ".md",
    // Python / ML
    ".py",
    ".ipynb",
    // Config / deps
    ".yaml",
    ".yml",
    ".toml",
    ".cfg",
    ".ini",
    ".txt",   // requirements.txt, constraints.txt
    // Other languages
    ".java",
    ".kt",
    ".go",
    ".rs",
    ".cpp",
    ".c",
    ".h",
    ".cs",
    ".rb",
    ".php",
    ".swift",
    ".r",
    ".R",
];