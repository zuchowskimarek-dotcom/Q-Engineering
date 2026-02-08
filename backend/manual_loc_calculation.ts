import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const author = "Dominik Tomiak";
const days = 7;
const rootPath = "/Users/marekzuchowski/Library/Mobile Documents/com~apple~CloudDocs/projects/Q-Products/Q-Agile/CodeBase/XQ";

function findGitRepos(dir: string, fileList: string[] = []) {
    try {
        const files = fs.readdirSync(dir);
        if (files.includes('.git')) {
            fileList.push(dir);
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
    console.log(`Found ${repos.length} git repositories.`);

    let totalAdditions = 0;
    let totalDeletions = 0;
    let totalCommits = 0;

    for (const repo of repos) {
        try {
            const output = execSync(
                `git log --author="${author}" --since="${days} days ago" --numstat --pretty=format:"COMMIT"`,
                { cwd: repo, encoding: 'utf8' }
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
                console.log(`Repo: ${path.relative(rootPath, repo) || '.'}`);
                console.log(`  Commits: ${repoCommits}`);
                console.log(`  Additions: ${repoAdd}`);
                console.log(`  Deletions: ${repoDel}`);
                totalAdditions += repoAdd;
                totalDeletions += repoDel;
                totalCommits += repoCommits;
            }
        } catch (e) { }
    }

    console.log('\n--- Final Summary ---');
    console.log(`Author: ${author}`);
    console.log(`Period: Last ${days} days`);
    console.log(`Total Commits: ${totalCommits}`);
    console.log(`Total Additions (LOC Added): ${totalAdditions}`);
    console.log(`Total Deletions: ${totalDeletions}`);
    console.log(`Net LOC Change: ${totalAdditions - totalDeletions}`);
}

main();
