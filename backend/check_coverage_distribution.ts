
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkCoverage() {
    try {
        console.log("--- Inspecting 'coverage' Data Distribution ---");

        // 1. Raw Value Stats
        const stats = await prisma.projectMetric.aggregate({
            _min: { coverage: true },
            _max: { coverage: true },
            _avg: { coverage: true },
            _count: true
        });
        console.log("Global Stats:", stats);

        // 2. Distinct Values (sample)
        const sample = await prisma.projectMetric.findMany({
            select: { coverage: true, timestamp: true, project: { select: { name: true } } },
            take: 20,
            orderBy: { timestamp: 'desc' }
        });
        console.table(sample.map(s => ({
            project: s.project.name,
            coverage: s.coverage,
            time: s.timestamp.toISOString().split('T')[1]
        })));

        // 3. Group By Project (Average)
        const byProject = await prisma.projectMetric.groupBy({
            by: ['projectId'],
            _avg: { coverage: true }
        });

        // Fetch project names for context
        const projects = await prisma.project.findMany();
        const projectMap = new Map(projects.map(p => [p.id, p.name]));

        console.log("\n--- Average Coverage by Project ---");
        byProject.forEach(p => {
            console.log(`Project: ${projectMap.get(p.projectId) || p.projectId} | Avg Coverage: ${p._avg.coverage?.toFixed(2)}%`);
        });

    } catch (e: any) {
        console.error("Error:", e.message);
    } finally {
        await prisma.$disconnect();
    }
}

checkCoverage();
