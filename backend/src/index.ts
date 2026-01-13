import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
// Utility to get all files in a directory recursively

const prisma = new PrismaClient();
const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(bodyParser.json());

// --- File System Endpoints ---

// List directories for browsing
app.get('/api/fs/ls', (req, res) => {
    const dirPath = (req.query.path as string) || process.env.HOME || process.env.USERPROFILE || '/';

    try {
        if (!fs.existsSync(dirPath)) {
            return res.status(404).json({ error: 'Path not found' });
        }

        const items = fs.readdirSync(dirPath, { withFileTypes: true });
        const isWindows = process.platform === 'win32';
        let hiddenNames = new Set<string>();

        try {
            if (isWindows) {
                // Windows: Use 'attrib' to find hidden folders
                // Output looks like: "   H     C:\path\to\folder"
                const output = execSync(`attrib "${path.join(dirPath, '*')}"`).toString();
                output.split('\n').forEach(line => {
                    if (line.includes('  H  ')) {
                        const parts = line.trim().split(/\s+/);
                        const fullPath = parts[parts.length - 1];
                        hiddenNames.add(path.basename(fullPath));
                    }
                });
            } else {
                // macOS/Linux: Use 'ls -lO' to find folders with 'hidden' flag
                const output = execSync(`ls -laO "${dirPath}"`).toString();
                output.split('\n').forEach(line => {
                    const parts = line.trim().split(/\s+/);
                    if (parts.length >= 8) {
                        // Flags are usually the 4th index (5th column)
                        // But let's look for known flags or '-'
                        const flagIndex = 4;
                        const flags = parts[flagIndex];
                        // Name starts after the date/time (usually index 8 or 9)
                        // A safer way to get the name is to look for the time pattern
                        let nameIndex = parts.findIndex(p => p.includes(':') || /^\d{4}$/.test(p)) + 1;
                        if (nameIndex > 0) {
                            const name = parts.slice(nameIndex).join(' ');
                            // Treat anything that isn't '-' or 'compressed' as a system/hidden flag 
                            // (this catches 'restricted', 'hidden', 'sunlnk', etc.)
                            if (flags !== '-' && !flags.includes('compressed') && name !== '.' && name !== '..') {
                                hiddenNames.add(name);
                            }
                        }
                    }
                });
                console.log(`[Directory API] Path: ${dirPath} | Detected ${hiddenNames.size} hidden items`);
            }
        } catch (e) {
            console.error('Failed to detect hidden attributes:', e);
        }

        const directories = items
            .filter(item => {
                if (!item.isDirectory()) return false;
                const name = item.name;
                const lowerName = name.toLowerCase();

                // Strictly hide anything starting with a dot
                if (name.startsWith('.')) return false;

                // 1. Whitelist & Strict Filtering (The "Golden Rules")
                const userWhitelist = new Set(['documents', 'downloads', 'shared', 'projects', 'workspace', 'development', 'library']);

                // Define strict whitelists for noisy system folders
                const strictFilters: Record<string, Set<string>> = {
                    'library': new Set(['mobile documents', 'developer', 'cloudstorage', 'containers', 'application support']),
                    'mobile documents': new Set(['com~apple~clouddocs'])
                };

                const dirName = path.basename(dirPath).toLowerCase();
                const homeDir = os.homedir();
                const isHomeDir = path.resolve(dirPath) === path.resolve(homeDir);

                // If we are in a folder with a strict whitelist, apply it immediately
                if (strictFilters[dirName]) {
                    if (!strictFilters[dirName].has(lowerName)) {
                        // console.log(`[Directory API] Hiding noise in ${dirName}: ${name}`);
                        return false;
                    }
                }

                // If we are in Home, always show these even if hidden by OS
                if (isHomeDir && userWhitelist.has(lowerName)) return true;

                // 2. Hide if marked with system flags by the OS
                if (hiddenNames.has(name)) {
                    // Check if it's in any whitelist before hiding
                    const isAlwaysShow = Array.from(Object.values(strictFilters)).some(set => set.has(lowerName));
                    if (!isAlwaysShow) {
                        // console.log(`[Directory API] Filtering system-flagged folder: ${name}`);
                        return false;
                    }
                }

                // 3. Fallback noise folders (common clutter)
                const systemFolders = new Set([
                    'node_modules', 'bin', 'cores', 'dev', 'etc', 'private', 'sbin',
                    'tmp', 'var', 'usr', 'opt', 'net', 'home', 'volumes', 'system',
                    'appdata', 'programdata', 'windows', 'system32', 'config.msi', '$recycle.bin',
                    'kernelcollections', 'keyboard layouts', 'internet plug-ins'
                ]);

                if (systemFolders.has(lowerName)) return false;

                return true;
            })
            .map(item => ({
                name: item.name,
                path: path.join(dirPath, item.name)
            }))
            .sort((a, b) => a.name.localeCompare(b.name));

        res.json({
            currentPath: dirPath,
            parentPath: path.dirname(dirPath),
            directories
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to read directory' });
    }
});

// --- People Endpoints ---

// Get all people
app.get('/api/people', async (req, res) => {
    const people = await prisma.person.findMany({
        include: { memberships: { include: { team: true } } },
    });
    res.json(people);
});

// Create a person
app.post('/api/people', async (req, res) => {
    const { name, email, gitUsername, msId } = req.body;
    try {
        const person = await prisma.person.create({
            data: { name, email, gitUsername, msId },
        });
        res.json(person);
    } catch (error) {
        res.status(400).json({ error: 'Email or MS ID already exists' });
    }
});

// Update a person
app.put('/api/people/:id', async (req, res) => {
    const { id } = req.params;
    const { name, email, gitUsername, msId } = req.body;
    const person = await prisma.person.update({
        where: { id },
        data: { name, email, gitUsername, msId },
    });
    res.json(person);
});

// Delete a person
app.delete('/api/people/:id', async (req, res) => {
    const { id } = req.params;
    await prisma.person.delete({ where: { id } });
    res.json({ success: true });
});

// --- Team Endpoints ---

// Get all teams
app.get('/api/teams', async (req, res) => {
    const teams = await prisma.team.findMany({
        include: {
            members: { include: { person: true } },
            projects: { include: { project: { include: { repository: true } } } }
        },
    });
    res.json(teams);
});

// Create a team
app.post('/api/teams', async (req, res) => {
    const { name, description } = req.body;
    const team = await prisma.team.create({
        data: { name, description },
    });
    res.json(team);
});

// Update a team
app.put('/api/teams/:id', async (req, res) => {
    const { id } = req.params;
    const { name, description } = req.body;
    const team = await prisma.team.update({
        where: { id },
        data: { name, description },
    });
    res.json(team);
});

// Delete a team
app.delete('/api/teams/:id', async (req, res) => {
    const { id } = req.params;
    await prisma.team.delete({ where: { id } });
    res.json({ success: true });
});

// --- Membership Endpoints ---

// Add person to team
app.post('/api/memberships', async (req, res) => {
    const { personId, teamId, role } = req.body;
    const membership = await prisma.teamMembership.create({
        data: { personId, teamId, role },
    });
    res.json(membership);
});

app.delete('/api/memberships/:personId/:teamId', async (req, res) => {
    const { personId, teamId } = req.params;
    await prisma.teamMembership.delete({
        where: { personId_teamId: { personId, teamId } }
    });
    res.json({ success: true });
});

// --- Team Projects Endpoints ---
app.post('/api/team-projects', async (req, res) => {
    const { teamId, projectId } = req.body;
    try {
        const assignment = await prisma.teamProject.create({
            data: { teamId, projectId }
        });
        res.json(assignment);
    } catch (e) {
        // likely duplicate
        res.status(400).json({ error: 'Already assigned' });
    }
});

app.delete('/api/team-projects/:projectId/:teamId', async (req, res) => {
    const { projectId, teamId } = req.params;
    await prisma.teamProject.deleteMany({
        where: { projectId, teamId } // using deleteMany to ignore if not found or id issues
    });
    res.json({ success: true });
});

// Remove person from team
app.delete('/api/memberships/:personId/:teamId', async (req, res) => {
    const { personId, teamId } = req.params;
    await prisma.teamMembership.delete({
        where: { personId_teamId: { personId, teamId } },
    });
    res.json({ success: true });
});

// Helper to detect repo type and remote URL from .git/config (searches upwards)
const detectRepoInfo = (repoPath: string): { type: string, remoteUrl: string | null, gitRoot: string | null } => {
    let currentPath = repoPath;
    let gitRoot: string | null = null;

    // Search upwards for .git directory
    while (currentPath !== path.parse(currentPath).root) {
        const configPath = path.join(currentPath, '.git', 'config');
        if (fs.existsSync(configPath)) {
            gitRoot = currentPath;
            break;
        }
        currentPath = path.dirname(currentPath);
    }

    if (!gitRoot) return { type: 'LOCAL', remoteUrl: null, gitRoot: null };

    try {
        const config = fs.readFileSync(path.join(gitRoot, '.git', 'config'), 'utf8');
        // Robust extraction of remote URL
        const urlMatch = config.match(/url\s*=\s*([^\n\r]+)/);
        const remoteUrl = urlMatch ? urlMatch[1].trim() : null;

        let type = 'LOCAL';
        if (remoteUrl) {
            const lowerUrl = remoteUrl.toLowerCase();
            if (lowerUrl.includes('github.com')) type = 'GITHUB';
            else if (lowerUrl.includes('gitlab')) type = 'GITLAB'; // Catch any gitlab host (macrix, etc)
        }

        if (type !== 'LOCAL') {
            return { type, remoteUrl, gitRoot };
        }
    } catch (e) {
        console.error('Error reading .git/config:', e);
    }

    // Fallback: Check for projects.json (common in some monorepos/manifest setups)
    try {
        const projectsPath = path.join(repoPath, 'projects.json');
        if (fs.existsSync(projectsPath)) {
            const content = fs.readFileSync(projectsPath, 'utf8');
            const data = JSON.parse(content);
            const firstProj = Array.isArray(data) ? data[0] : (data.projects ? data.projects[0] : data);
            const remoteUrl = firstProj?.http_url_to_repo || firstProj?.web_url || firstProj?.ssh_url_to_repo || null;

            if (content.toLowerCase().includes('gitlab')) return { type: 'GITLAB', remoteUrl, gitRoot };
            if (content.toLowerCase().includes('github')) return { type: 'GITHUB', remoteUrl, gitRoot };
        }
    } catch (e) {
        // ignore
    }

    return { type: 'LOCAL', remoteUrl: null, gitRoot };
};

// Endpoint to detect repository info before saving
app.get('/api/fs/detect-repo', (req, res) => {
    const repoPath = req.query.path as string;
    if (!repoPath || !fs.existsSync(repoPath)) {
        return res.status(404).json({ error: 'Path not found' });
    }

    const info = detectRepoInfo(repoPath);
    res.json(info);
});

// Get all repositories with projects
app.get('/api/repositories', async (req, res) => {
    const repos = await prisma.repository.findMany({
        include: { projects: true },
    });
    res.json(repos);
});

// Create repository (Local-First)
app.post('/api/repositories', async (req, res) => {
    console.log('POST /api/repositories - Body:', req.body);
    const { url, path: bodyPath, name } = req.body;
    const finalUrl = url || bodyPath;

    if (!finalUrl || !fs.existsSync(finalUrl)) {
        console.log('Path check failed:', finalUrl);
        return res.status(400).json({ error: 'Path does not exist' });
    }

    const finalName = name || path.basename(finalUrl);
    const { type, remoteUrl } = detectRepoInfo(finalUrl);
    console.log(`Creating repo: ${finalName}, Path: ${finalUrl}, Type: ${type}, Remote: ${remoteUrl}`);

    try {
        const repo = await prisma.repository.create({
            data: {
                name: finalName,
                url: finalUrl,
                type: type as any,
                remoteUrl
            },
        });

        // Auto-run discovery on creation
        await runDiscovery(repo.id, url);

        const updatedRepo = await prisma.repository.findUnique({
            where: { id: repo.id },
            include: { projects: true }
        });

        res.json(updatedRepo);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create repository' });
    }
});

// Helper for discovery
const findProjects = (dir: string, repoId: string, rootDir: string): any[] => {
    let results: any[] = [];
    try {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        for (const item of items) {
            if (item.isDirectory()) {
                const name = item.name;
                // Ignore common non-project folders
                if (['node_modules', '.git', 'dist', 'build', 'coverage', '.idea', '.vscode'].includes(name)) continue;

                const fullPath = path.join(dir, name);

                // Add current folder as a project
                // For nested projects, name could be 'parent/child' or just 'child'.
                // Let's use relative path from root for uniqueness/clarity if needed, 
                // but user asked for "folder name" mostly. 
                // XQ/wes/mfc -> Project "mfc" (or maybe "wes/mfc")
                // Let's store simple name for now, but handle path.

                results.push({
                    name: name,
                    path: fullPath,
                    isSelected: true,
                    repositoryId: repoId
                });

                // Recurse
                results = results.concat(findProjects(fullPath, repoId, rootDir));
            }
        }
    } catch (e) {
        // Access denied or other fs errors
    }
    return results;
};

const runDiscovery = async (repoId: string, repoPath: string) => {
    try {
        // Recursive scan
        const subdirs = findProjects(repoPath, repoId, repoPath);

        // Clear and recreate
        await prisma.project.deleteMany({ where: { repositoryId: repoId } });
        if (subdirs.length > 0) {
            await prisma.project.createMany({ data: subdirs });
        }
    } catch (e) {
        console.error('Discovery failed:', e);
    }
};

// Delete repository
app.delete('/api/repositories/:id', async (req, res) => {
    const { id } = req.params;
    await prisma.repository.delete({ where: { id } });
    res.json({ success: true });
});

// Update repository
app.put('/api/repositories/:id', async (req, res) => {
    const { id } = req.params;
    const { name, url, type, remoteUrl } = req.body;
    try {
        const updated = await prisma.repository.update({
            where: { id },
            data: { name, url, type, remoteUrl }
        });
        res.json(updated);
    } catch (e) {
        res.status(500).json({ error: 'Failed to update repository' });
    }
});

// Discovery: Scan repository for subprojects
app.post('/api/repositories/:id/discover', async (req, res) => {
    const { id } = req.params;
    const repo = await prisma.repository.findUnique({ where: { id } });
    if (!repo) return res.status(404).json({ error: 'Repo not found' });

    await runDiscovery(id, repo.url);

    const updatedProjects = await prisma.project.findMany({ where: { repositoryId: id } });
    res.json(updatedProjects);
});

// Toggle project selection
app.patch('/api/projects/:id/toggle', async (req, res) => {
    const { id } = req.params;
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const updated = await prisma.project.update({
        where: { id },
        data: { isSelected: !project.isSelected }
    });
    res.json(updated);
});

app.patch('/api/projects/bulk-toggle', async (req, res) => {
    const { ids, isSelected } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'Ids must be an array' });

    await prisma.project.updateMany({
        where: { id: { in: ids } },
        data: { isSelected: !!isSelected }
    });
    res.json({ success: true });
});

// --- Import Endpoints ---

// Helper to recursively find .git directories
const findGitRepos = (dir: string, fileList: string[] = []) => {
    const files = fs.readdirSync(dir);
    if (files.includes('.git')) {
        fileList.push(dir);
        // Don't recurse into a .git repo unless it's a submodule scenario, 
        // but typically we stop at the repo root. 
        // However, if we want to find nested repos (not submodules), we might check subdirs.
        // For safety/speed let's assume standard nested structure and scan subfolders too 
        // if they are not .git folder itself.
    }

    files.forEach((file) => {
        if (file === '.git' || file === 'node_modules' || file === 'dist' || file === 'build') return;
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            findGitRepos(filePath, fileList);
        }
    });
    return fileList;
};

app.get('/api/import/git-authors', async (req, res) => {
    const { repoId } = req.query;
    const authors = new Map();

    try {
        let searchRoots: string[] = [];

        if (repoId) {
            const repo = await prisma.repository.findUnique({ where: { id: repoId as string } });
            if (!repo) return res.status(404).json({ error: 'Repository not found' });
            searchRoots = [repo.url];
        } else {
            // Fallback to all repositories if no ID provided
            const repos = await prisma.repository.findMany();
            searchRoots = repos.map(r => r.url);
        }

        let allGitRepos: string[] = [];
        for (const root of searchRoots) {
            if (fs.existsSync(root)) {
                // recursively find all .git roots under this path
                const found = findGitRepos(root);
                allGitRepos = [...allGitRepos, ...found];
            }
        }

        // Deduplicate
        allGitRepos = [...new Set(allGitRepos)];

        console.log(`Scanning ${allGitRepos.length} git repositories...`);

        for (const projectPath of allGitRepos) {
            try {
                // Get authors: count | name | email
                const output = execSync('git shortlog -sne --all', { cwd: projectPath, encoding: 'utf8', maxBuffer: 1024 * 1024 * 10 }).toString();
                const lines = output.split('\n');
                for (const line of lines) {
                    const match = line.trim().match(/^\s*(\d+)\s+([^<]+)<([^>]+)>$/);
                    if (match) {
                        const [_, count, name, email] = match;
                        // Key by normalized name (remove spaces/special chars, lowercase) to catch "Rustam Ashurov" vs "RustamAshurov"
                        const cleanNameKey = name.toLowerCase().replace(/[^a-z0-9]/g, '');
                        const cleanEmail = email.toLowerCase().trim();

                        if (!authors.has(cleanNameKey)) {
                            authors.set(cleanNameKey, {
                                name: name.trim(),
                                emails: new Set([cleanEmail]),
                                commits: parseInt(count),
                                repo: path.basename(projectPath)
                            });
                        } else {
                            const entry = authors.get(cleanNameKey);
                            entry.commits += parseInt(count);
                            entry.emails.add(cleanEmail);
                            // If current name has spaces and stored one doesn't, prefer the one with spaces
                            if (name.includes(' ') && !entry.name.includes(' ')) {
                                entry.name = name.trim();
                            }
                        }
                    }
                }
            } catch (e: any) {
                console.error(`Error scanning ${projectPath}:`, e.message);
            }
        }

        const result = Array.from(authors.values())
            .map((a: any) => ({
                ...a,
                email: Array.from(a.emails).join(', ') // Join multiple emails
            }))
            .sort((a, b) => b.commits - a.commits);
        console.log(`Found ${result.length} unique authors.`);
        res.json(result);
    } catch (error) {
        console.error('Scan failed:', error);
        res.status(500).json({ error: 'Failed to scan repositories' });
    }
});

app.listen(port, () => {
    console.log(`Backend listening at http://localhost:${port}`);
});
