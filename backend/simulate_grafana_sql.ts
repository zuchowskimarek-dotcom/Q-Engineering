import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    // Simulate Grafana SQL for Lines of Code
    const sql = `
        SELECT
            m.timestamp,
            per.name AS metric,
            MAX(m."linesOfCode") AS value
        FROM "ProjectMetric" m
        JOIN "Project" p ON m."projectId" = p.id
        JOIN "TeamProject" tp ON tp."projectId" = p.id
        JOIN "Team" t ON t.id = tp."teamId"
        JOIN "TeamMembership" tm ON tm."teamId" = t.id
        JOIN "Person" per ON per.id = tm."personId"
        WHERE 
            per.name IN ('Dominik Tomiak', 'Piotr Pietrzak')
        GROUP BY 1, 2
        ORDER BY 1, 2
    `;

    const results: any[] = await prisma.$queryRawUnsafe(sql);

    const dominikPoints = results.filter(r => r.metric === 'Dominik Tomiak');
    const piotrPoints = results.filter(r => r.metric === 'Piotr Pietrzak');

    console.log(`Dominik Points: ${dominikPoints.length}`);
    if (dominikPoints.length > 0) {
        console.log(`First Dominik Value: ${dominikPoints[0].value} at ${dominikPoints[0].timestamp}`);
        console.log(`Last Dominik Value: ${dominikPoints[dominikPoints.length - 1].value} at ${dominikPoints[dominikPoints.length - 1].timestamp}`);
    }

    console.log(`Piotr Points: ${piotrPoints.length}`);
    if (piotrPoints.length > 0) {
        console.log(`First Piotr Value: ${piotrPoints[0].value} at ${piotrPoints[0].timestamp}`);
        console.log(`Last Piotr Value: ${piotrPoints[piotrPoints.length - 1].value} at ${piotrPoints[piotrPoints.length - 1].timestamp}`);
    }

    // Check for "0" values
    const zeroDominik = dominikPoints.filter(p => p.value === 0);
    console.log(`Dominik Zero Points: ${zeroDominik.length}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
