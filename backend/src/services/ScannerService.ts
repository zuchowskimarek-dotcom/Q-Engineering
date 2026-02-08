import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export interface AuthorMetric {
    gitEmail: string;
    additions: number;
    deletions: number;
    commitCount: number;
}

export interface ProjectMetrics {
    linesOfCode: number;
    commitCount: number;
    coverage?: number;
    churn: number;
    authors: AuthorMetric[];
}

export interface FileMetrics {
    loc: number;
    churn: number;
    additions: number;
    deletions: number;
    commitCount: number;
    authors: Record<string, AuthorMetric>;
}

export interface RepoData {
    files: Record<string, FileMetrics>;
    coverage?: number;
}

export class ScannerService {
    /**
     * Counts lines of code in a directory recursively.
     * Simple implementation for v1: filters by extension and counts lines.
     */
    static countLOC(directoryPath: string): number {
        if (!fs.existsSync(directoryPath)) return 0;

        const extensions = ['.ts', '.tsx', '.js', '.jsx', '.cs', '.py', '.java', '.go', '.rs'];
        let totalLines = 0;

        const scan = (dir: string) => {
            const files = fs.readdirSync(dir);
            for (const file of files) {
                const fullPath = path.join(dir, file);
                const stat = fs.statSync(fullPath);

                if (stat.isDirectory()) {
                    // Skip node_modules, bin, obj, dist, etc.
                    if (['node_modules', 'bin', 'obj', 'dist', '.git', '.next'].includes(file)) continue;
                    scan(fullPath);
                } else if (extensions.includes(path.extname(file))) {
                    const content = fs.readFileSync(fullPath, 'utf-8');
                    totalLines += content.split('\n').filter(line => line.trim() !== '').length;
                }
            }
        };

        try {
            scan(directoryPath);
        } catch (error) {
            console.error(`Error scanning LOC for ${directoryPath}:`, error);
        }

        return totalLines;
    }

    /**
     * Gets commit counts for a specific path in a given time range.
     */
    static getCommitCount(directoryPath: string, since: string = "24 hours ago"): number {
        try {
            // Find git root first
            const gitRoot = execSync('git rev-parse --show-toplevel', { cwd: directoryPath }).toString().trim();
            const relativePath = path.relative(gitRoot, directoryPath) || '.';

            const output = execSync(
                `git log --since="${since}" --oneline -- "${relativePath}"`,
                { cwd: gitRoot }
            ).toString().trim();

            return output ? output.split('\n').length : 0;
        } catch (error) {
            // Not a git repo or other error
            return 0;
        }
    }

    /**
     * Gets detailed metrics per author for a given time range.
     */
    static getAuthorMetrics(directoryPath: string, since: string = "24 hours ago"): AuthorMetric[] {
        try {
            const gitRoot = execSync('git rev-parse --show-toplevel', { cwd: directoryPath }).toString().trim();
            const relativePath = path.relative(gitRoot, directoryPath) || '.';

            // Using numstat to get additions/deletions and author email
            const output = execSync(
                `git log --since="${since}" --numstat --format="AUTHOR:%aE" -- "${relativePath}"`,
                { cwd: gitRoot }
            ).toString().trim();

            if (!output) return [];

            const authorMap: Record<string, AuthorMetric> = {};
            let currentAuthor = '';

            const lines = output.split('\n');
            for (const line of lines) {
                if (line.startsWith('AUTHOR:')) {
                    currentAuthor = line.replace('AUTHOR:', '').trim();
                    if (!authorMap[currentAuthor]) {
                        authorMap[currentAuthor] = { gitEmail: currentAuthor, additions: 0, deletions: 0, commitCount: 0 };
                    }
                    authorMap[currentAuthor].commitCount++;
                } else if (currentAuthor) {
                    const match = line.match(/^(\d+)\s+(\d+)\s+.+$/);
                    if (match) {
                        authorMap[currentAuthor].additions += parseInt(match[1], 10);
                        authorMap[currentAuthor].deletions += parseInt(match[2], 10);
                    }
                }
            }

            return Object.values(authorMap);
        } catch (error) {
            return [];
        }
    }

    /**
     * Performs a single-pass scan of the entire repository for a given time range.
     * Handles nested git repositories by searching for all .git folders.
     */
    static async scanFullRepository(repoPath: string, remoteUrl?: string, since: string = "24 hours ago"): Promise<RepoData> {
        console.log(`[Scanner] Performing global scan for: ${repoPath}`);
        const repoData: RepoData = { files: {} };

        if (remoteUrl) {
            repoData.coverage = await this.getRepoCoverage(remoteUrl);
        }

        const extensions = ['.ts', '.tsx', '.js', '.jsx', '.cs', '.py', '.java', '.go', '.rs'];

        // 1. Recursive file scan for LOC
        const scanLOC = (dir: string) => {
            const items = fs.readdirSync(dir, { withFileTypes: true });
            for (const item of items) {
                const fullPath = path.join(dir, item.name);
                const relPath = path.relative(repoPath, fullPath);

                if (item.isDirectory()) {
                    if (['node_modules', 'bin', 'obj', 'dist', '.git', '.next'].includes(item.name)) continue;
                    scanLOC(fullPath);
                } else if (extensions.includes(path.extname(item.name))) {
                    try {
                        const content = fs.readFileSync(fullPath, 'utf-8');
                        const loc = content.split('\n').filter(line => line.trim() !== '').length;
                        repoData.files[relPath] = {
                            loc,
                            churn: 0,
                            additions: 0,
                            deletions: 0,
                            commitCount: 0,
                            authors: {}
                        };
                    } catch (e) { }
                }
            }
        };
        scanLOC(repoPath);

        // 2. Discover all git repositories (including nested ones)
        const gitRepos: string[] = [];
        const findGitRepos = (dir: string) => {
            if (fs.existsSync(path.join(dir, '.git'))) {
                gitRepos.push(dir);
            }
            const items = fs.readdirSync(dir, { withFileTypes: true });
            for (const item of items) {
                if (item.isDirectory()) {
                    if (['node_modules', 'bin', 'obj', 'dist', '.git'].includes(item.name)) continue;
                    findGitRepos(path.join(dir, item.name));
                }
            }
        };
        findGitRepos(repoPath);

        // 3. Process each git repo found
        for (const gitDir of gitRepos) {
            try {
                const logOutput = execSync(
                    `git log --since="${since}" --numstat --format="AUTHOR:%aE"`,
                    { cwd: gitDir, maxBuffer: 10 * 1024 * 1024 }
                ).toString().trim();

                if (!logOutput) continue;

                let currentAuthor = '';
                const lines = logOutput.split('\n');
                for (const line of lines) {
                    if (line.startsWith('AUTHOR:')) {
                        currentAuthor = line.replace('AUTHOR:', '').trim();
                    } else if (currentAuthor) {
                        const match = line.match(/^(\d+)\s+(\d+)\s+(.+)$/);
                        if (match) {
                            const additions = parseInt(match[1], 10);
                            const deletions = parseInt(match[2], 10);
                            const gitFilePath = match[3];

                            // Git log --numstat paths are relative to the gitDir.
                            // We need them relative to repoPath.
                            const absoluteFilePath = path.join(gitDir, gitFilePath);
                            const repoRelPath = path.relative(repoPath, absoluteFilePath);

                            if (!repoData.files[repoRelPath]) {
                                repoData.files[repoRelPath] = {
                                    loc: 0,
                                    churn: 0,
                                    additions: 0,
                                    deletions: 0,
                                    commitCount: 0,
                                    authors: {}
                                };
                            }

                            const file = repoData.files[repoRelPath];
                            file.additions += additions;
                            file.deletions += deletions;
                            file.churn += (additions + deletions);
                            file.commitCount++;

                            if (!file.authors[currentAuthor]) {
                                file.authors[currentAuthor] = { gitEmail: currentAuthor, additions: 0, deletions: 0, commitCount: 0 };
                            }
                            file.authors[currentAuthor].additions += additions;
                            file.authors[currentAuthor].deletions += deletions;
                            file.authors[currentAuthor].commitCount++;
                        }
                    }
                }
            } catch (error) {
                console.error(`[Scanner] Git log failed for ${gitDir}:`, error);
            }
        }

        return repoData;
    }

    /**
     * Slices global repo data for a specific subdirectory path.
     */
    static sliceMetricsForPath(repoData: RepoData, relativePath: string, repoRoot: string): ProjectMetrics {
        const heuristicCoverage = this.calculateHeuristicCoverage(repoRoot, relativePath, repoData);

        const result: ProjectMetrics = {
            linesOfCode: 0,
            commitCount: 0,
            coverage: heuristicCoverage ?? repoData.coverage, // Prefer heuristic, fallback to global
            churn: 0,
            authors: []
        };

        const authorAggregator: Record<string, AuthorMetric> = {};

        // Find all files that start with this path
        // Ensure path ends with separator for exact match
        const prefix = relativePath === '' || relativePath === '.' ? '' : relativePath + path.sep;

        for (const [filePath, file] of Object.entries(repoData.files)) {
            if (filePath === relativePath || filePath.startsWith(prefix)) {
                result.linesOfCode += file.loc;
                result.churn += file.churn;
                result.commitCount += file.commitCount;

                for (const [email, author] of Object.entries(file.authors)) {
                    if (!authorAggregator[email]) {
                        authorAggregator[email] = { gitEmail: email, additions: 0, deletions: 0, commitCount: 0 };
                    }
                    authorAggregator[email].additions += author.additions;
                    authorAggregator[email].deletions += author.deletions;
                    authorAggregator[email].commitCount += author.commitCount;
                }
            }
        }

        result.authors = Object.values(authorAggregator);
        return result;
    }


    /**
     * Calculates heuristic coverage for a specific path by scanning source and test files.
     * Logic:
     * 1. Find all .cs Source files (excluding *Test*).
     * 2. Find all .cs Test files (including *Test*).
     * 3. Extract public methods from Source.
     * 4. Check if method name appears in ANY Test file content.
     */
    static calculateHeuristicCoverage(repoPath: string, relativePath: string, repoData: RepoData): number | undefined {
        try {
            const prefix = relativePath === '' || relativePath === '.' ? '' : relativePath + path.sep;

            const sourceFiles: string[] = [];
            const testFiles: string[] = [];

            // 1. Identification Phase
            for (const filePath of Object.keys(repoData.files)) {
                // Must be within the project scope (slice)
                if (filePath === relativePath || filePath.startsWith(prefix)) {
                    // Only C# for now as per requirement
                    if (filePath.endsWith('.cs')) {
                        if (filePath.includes('Test') || filePath.includes('.Tests.')) {
                            testFiles.push(path.join(repoPath, filePath));
                        } else {
                            sourceFiles.push(path.join(repoPath, filePath));
                        }
                    }
                }
            }

            if (sourceFiles.length === 0) return undefined;

            // 2. Load Test Content
            let allTestContent = "";
            for (const tf of testFiles) {
                try {
                    allTestContent += fs.readFileSync(tf, 'utf8') + "\n";
                } catch (e) { /* ignore read error */ }
            }

            // 3. Method Analysis
            let totalMethods = 0;
            let coveredMethods = 0;

            // Regex for C# public methods: public [async] [static/virtual] ReturnType MethodName(...)
            const methodRegex = /public\s+(?:async\s+)?(?:virtual\s+|override\s+|static\s+|sealed\s+)?(?:[\w<>.\[\]?]+\s+)+(\w+)\s*(?:<[^>]+>)?\s*\(/g;

            for (const sf of sourceFiles) {
                try {
                    const content = fs.readFileSync(sf, 'utf8');
                    let match;
                    while ((match = methodRegex.exec(content)) !== null) {
                        const methodName = match[1];

                        // Skip constructors (matches class name) - simplistic check
                        const classNameMatch = /class\s+(\w+)/.exec(content);
                        if (classNameMatch && classNameMatch[1] === methodName) continue;

                        totalMethods++;
                        if (allTestContent.includes(methodName)) {
                            coveredMethods++;
                        }
                    }
                } catch (e) { /* ignore read error */ }
            }

            if (totalMethods === 0) return 0;

            const percentage = (coveredMethods / totalMethods) * 100;
            // console.log(`[Heuristic] ${relativePath}: ${coveredMethods}/${totalMethods} = ${percentage.toFixed(2)}%`);
            return parseFloat(percentage.toFixed(2));

        } catch (error) {
            console.error(`Error calculating heuristic coverage for ${relativePath}:`, error);
            return undefined;
        }
    }

    /**
     * Attempts to fetch the latest pipeline coverage from GitLab API for a repository.
     */
    static async getRepoCoverage(remoteUrl: string): Promise<number | undefined> {
        if (!remoteUrl) return undefined;
        try {
            // 1. Extract the project path from the URL
            // Format: https://...gitlab.macrix.eu/path/to/project.git
            const match = remoteUrl.match(/gitlab\.macrix\.eu\/(.+)\.git/);
            if (!match) return undefined;

            const projectPath = match[1];
            const encodedPath = encodeURIComponent(projectPath);

            // 2. Call GitLab API
            const apiUrl = process.env.GITLAB_API_URL || 'https://gitlab.macrix.eu/api/v4';
            const token = process.env.GITLAB_TOKEN;

            if (!token) {
                // console.warn('GITLAB_TOKEN not found in environment');
                return undefined;
            }

            const response = await fetch(`${apiUrl}/projects/${encodedPath}/pipelines/latest`, {
                headers: {
                    'PRIVATE-TOKEN': token
                }
            });

            if (!response.ok) {
                if (response.status === 404) {
                    return undefined;
                }
                console.error(`GitLab API error: ${response.status} ${response.statusText} for ${projectPath}`);
                return undefined;
            }

            const pipeline: any = await response.json();
            return pipeline.coverage ? parseFloat(pipeline.coverage) : undefined;
        } catch (error) {
            console.error(`Error detecting coverage for ${remoteUrl}:`, error);
            return undefined;
        }
    }
}
