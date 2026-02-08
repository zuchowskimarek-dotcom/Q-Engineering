
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkLatestCoverage() {
    try {
        console.log("--- Latest Coverage per Project ---");

        // Get all projects
        const projects = await prisma.project.findMany({
            include: { repository: true },
            orderBy: { name: 'asc' }
        });

        console.log(`Found ${projects.length} projects. Fetching latest metric...`);

        for (const p of projects) {
            const latest = await prisma.projectMetric.findFirst({
                where: { projectId: p.id },
                orderBy: { timestamp: 'desc' }
            });

            if (latest) {
                console.log(`[${p.name.padEnd(25)}] Coverage: ${latest.coverage?.toFixed(2)}%  (Time: ${latest.timestamp.toISOString()})`);
            } else {
                console.log(`[${p.name.padEnd(25)}] No metrics found.`);
            }
        }

    } catch (e: any) {
        console.error("Error:", e.message);
    } finally {
        await prisma.$disconnect();
    }
}

checkLatestCoverage();
