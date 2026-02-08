
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const prisma = new PrismaClient();

async function scanForCoverage() {
    try {
        console.log("--- Finding 'XQ' Repository Path ---");
        const repo = await prisma.repository.findFirst({
            where: { name: { contains: 'XQ', mode: 'insensitive' } }
        });

        if (!repo || !repo.url) {
            console.error("Repository 'XQ' not found in database.");
            return;
        }

        const repoPath = repo.url;
        console.log(`Target Repo: ${repo.name}`);
        console.log(`Path: ${repoPath}`);

        if (!fs.existsSync(repoPath)) {
            console.error("Path does not exist on disk.");
            return;
        }

        console.log("\n--- Scanning for Coverage Artifacts ---");
        const coveragePatterns = ['lcov.info', 'clover.xml', 'coverage-final.json', 'jacoco.xml', 'coverage.xml', 'cobertura.xml'];
        const foundFiles: string[] = [];

        // Helper for recursive scan
        const walk = (dir: string) => {
            try {
                const list = fs.readdirSync(dir);
                if (list.includes('.git') && dir !== repoPath) {
                    // Optional: Treat submodules differently? For now, just descend.
                }

                list.forEach(file => {
                    // optimized skip
                    if (['node_modules', '.git', 'dist', 'build', '.idea', '.vscode'].includes(file)) return;

                    const fullPath = path.join(dir, file);
                    const stat = fs.statSync(fullPath);

                    if (stat.isDirectory()) {
                        walk(fullPath);
                    } else {
                        if (coveragePatterns.some(p => file.endsWith(p))) {
                            foundFiles.push(fullPath);
                        }
                    }
                });
            } catch (e) {
                // ignore access denied
            }
        };

        walk(repoPath);

        if (foundFiles.length === 0) {
            console.log("No standard coverage files found (e.g. lcov.info, clover.xml).");
        } else {
            console.log(`Found ${foundFiles.length} coverage files:`);
            foundFiles.forEach(f => {
                const relative = path.relative(repoPath, f);
                const size = fs.statSync(f).size;
                console.log(` - ${relative} (${size} bytes)`);
            });
        }

        console.log("\n--- Checking .gitlab-ci.yml for Coverage Regex ---");
        const ciPath = path.join(repoPath, '.gitlab-ci.yml');
        if (fs.existsSync(ciPath)) {
            const content = fs.readFileSync(ciPath, 'utf8');
            const coverageLines = content.split('\n').filter(l => l.includes('coverage:') && l.includes('/'));
            if (coverageLines.length > 0) {
                console.log("Found coverage regexes in CI config:");
                coverageLines.forEach(l => console.log(`  ${l.trim()}`));
            } else {
                console.log("No explicit 'coverage:' regex found in root .gitlab-ci.yml");
            }
        } else {
            console.log(".gitlab-ci.yml not found.");
        }

    } catch (e: any) {
        console.error("Error:", e.message);
    } finally {
        await prisma.$disconnect();
    }
}

scanForCoverage();
