import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const authorEmail = "dominik.tomiak@macrix.pl";
const days = 7;
const rootPath = "/Users/marekzuchowski/Library/Mobile Documents/com~apple~CloudDocs/projects/Q-Products/Q-Agile/CodeBase/XQ";

function findGitRepos(dir: string, fileList: string[] = []) {
    try {
        const files = fs.readdirSync(dir);
        if (files.includes('.git')) {
            fileList.push(dir);
            // Don't recurse into found git repos to avoid submodules issues for now, 
            // but usually we WANT submodules if they are separate repos.
            // Actually, keep recursing but skip the .git folder itself.
        }
        files.forEach((file) => {
            if (file === '.git' || file === 'node_modules' || file === 'dist' || file === 'build') return;
            const filePath = path.join(dir, file);
            if (fs.statSync(filePath).isDirectory()) {
                findGitRepos(filePath, fileList);
            }
        });
    } catch (e) { }
    return fileList;
}

async function main() {
    const repos = findGitRepos(rootPath);
    console.log(`Scanning ${repos.length} git repositories...`);

    let totalAdditions = 0;
    let totalDeletions = 0;
    let totalCommits = 0;
    let reposWithActivity = 0;

    for (const repo of repos) {
        try {
            // Using email for more reliable matching
            const output = execSync(
                `git log --author="${authorEmail}" --since="${days} days ago" --numstat --pretty=format:"COMMIT"`,
                { cwd: repo, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
            ).toString().trim();

            if (!output) continue;

            const lines = output.split('\n');
            let repoAdd = 0;
            let repoDel = 0;
            let repoCommits = 0;

            for (const line of lines) {
                if (line === "COMMIT") {
                    repoCommits++;
                    continue;
                }
                const match = line.match(/^(\d+)\s+(\d+)\s+(.+)$/);
                if (match) {
                    repoAdd += parseInt(match[1], 10);
                    repoDel += parseInt(match[2], 10);
                }
            }

            if (repoCommits > 0) {
                reposWithActivity++;
                console.log(`[OK] ${path.relative(rootPath, repo) || '.'}: ${repoCommits} commits, +${repoAdd} / -${repoDel}`);
                totalAdditions += repoAdd;
                totalDeletions += repoDel;
                totalCommits += repoCommits;
            }
        } catch (e) {
            // Probably no commits in the range or repo error
        }
    }

    console.log('\n--- Final Summary for Dominik Tomiak ---');
    console.log(`Email: ${authorEmail}`);
    console.log(`Period: Last ${days} days`);
    console.log(`Repositories with activity: ${reposWithActivity}`);
    console.log(`Total Commits: ${totalCommits}`);
    console.log(`Total Lines Added (LOC): ${totalAdditions}`);
    console.log(`Total Lines Deleted: ${totalDeletions}`);
    console.log(`Net Expansion: ${totalAdditions - totalDeletions}`);
    console.log(`Total Churn: ${totalAdditions + totalDeletions}`);
}

main();
