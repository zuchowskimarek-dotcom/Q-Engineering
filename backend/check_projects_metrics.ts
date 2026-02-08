import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const projects = await prisma.project.findMany();
    console.log(`Found ${projects.length} projects.`);

    for (const p of projects) {
        const count = await prisma.projectMetric.count({ where: { projectId: p.id } });
        if (count === 0) {
            console.log(`Project: ${p.name}, Count: 0`);
            continue;
        }
        const latest = await prisma.projectMetric.findFirst({
            where: { projectId: p.id },
            orderBy: { timestamp: 'desc' }
        });
        const earliest = await prisma.projectMetric.findFirst({
            where: { projectId: p.id },
            orderBy: { timestamp: 'asc' }
        });
        console.log(`Project: ${p.name}, Count: ${count}`);
        console.log(`  Earliest: ${earliest?.timestamp}`);
        console.log(`  Latest:   ${latest?.timestamp}`);
        console.log(`  Current LOC: ${latest?.linesOfCode}`);
    }

    const t = await prisma.team.findMany({ include: { members: { include: { person: true } }, projects: { include: { project: true } } } });
    for (const team of t) {
        console.log(`\nTeam: ${team.name}`);
        console.log(`  Members: ${team.members.map(m => m.person.name).join(', ')}`);
        console.log(`  Projects: ${team.projects.map(p => p.project.name).join(', ')}`);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
