import { PrismaClient } from '@prisma/client';
import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import path from 'path';

const prisma = new PrismaClient();
const sqlitePath = path.join(__dirname, '../../prisma/dev.db');
const db = new sqlite3.Database(sqlitePath);

const dbAll = promisify(db.all).bind(db);

async function migrate() {
    console.log('--- Starting Data Migration from SQLite to PostgreSQL ---');

    try {
        // 1. Migrate Persons
        const persons: any[] = await dbAll('SELECT * FROM Person');
        console.log(`Found ${persons.length} persons in SQLite.`);
        for (const p of persons) {
            await prisma.person.upsert({
                where: { id: p.id },
                update: {},
                create: {
                    id: p.id,
                    name: p.name,
                    email: p.email,
                    gitUsername: p.gitUsername,
                    msId: p.msId,
                    createdAt: new Date(p.createdAt),
                    updatedAt: new Date(p.updatedAt)
                }
            });
        }

        // 2. Migrate Teams
        const teams: any[] = await dbAll('SELECT * FROM Team');
        console.log(`Found ${teams.length} teams in SQLite.`);
        for (const t of teams) {
            await prisma.team.upsert({
                where: { id: t.id },
                update: {},
                create: {
                    id: t.id,
                    name: t.name,
                    description: t.description,
                    createdAt: new Date(t.createdAt),
                    updatedAt: new Date(t.updatedAt)
                }
            });
        }

        // 3. Migrate Repositories
        const repos: any[] = await dbAll('SELECT * FROM Repository');
        console.log(`Found ${repos.length} repositories in SQLite.`);
        for (const r of repos) {
            await prisma.repository.upsert({
                where: { id: r.id },
                update: {},
                create: {
                    id: r.id,
                    name: r.name,
                    url: r.url,
                    remoteUrl: r.remoteUrl,
                    type: r.type,
                    createdAt: new Date(r.createdAt),
                    updatedAt: new Date(r.updatedAt),
                    syncStatus: 'IDLE'
                }
            });
        }

        // 4. Migrate Projects
        const projects: any[] = await dbAll('SELECT * FROM Project');
        console.log(`Found ${projects.length} projects in SQLite.`);
        for (const p of projects) {
            await prisma.project.upsert({
                where: { id: p.id },
                update: {},
                create: {
                    id: p.id,
                    name: p.name,
                    path: p.path,
                    isSelected: p.isSelected === 1 || p.isSelected === true,
                    repositoryId: p.repositoryId,
                    createdAt: new Date(p.createdAt),
                    updatedAt: new Date(p.updatedAt)
                }
            });
        }

        // 5. Migrate TeamMemberships
        const memberships: any[] = await dbAll('SELECT * FROM TeamMembership');
        console.log(`Found ${memberships.length} memberships in SQLite.`);
        for (const m of memberships) {
            await prisma.teamMembership.upsert({
                where: { personId_teamId: { personId: m.personId, teamId: m.teamId } },
                update: {},
                create: {
                    personId: m.personId,
                    teamId: m.teamId,
                    role: m.role,
                    createdAt: new Date(m.createdAt)
                }
            });
        }

        // 6. Migrate TeamProjects
        const teamProjects: any[] = await dbAll('SELECT * FROM TeamProject');
        console.log(`Found ${teamProjects.length} teamProjects in SQLite.`);
        for (const tp of teamProjects) {
            await prisma.teamProject.upsert({
                where: { teamId_projectId: { teamId: tp.teamId, projectId: tp.projectId } },
                update: {},
                create: {
                    teamId: tp.teamId,
                    projectId: tp.projectId,
                    assignedAt: new Date(tp.assignedAt)
                }
            });
        }

        console.log('--- Migration Completed Successfully! ---');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await prisma.$disconnect();
        db.close();
    }
}

migrate();
