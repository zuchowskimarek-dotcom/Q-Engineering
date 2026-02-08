import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const wmsTeam = await prisma.team.findFirst({ where: { name: 'WMS' } });
    const dominik = await prisma.person.findFirst({ where: { name: 'Dominik Tomiak' } });
    const piotr = await prisma.person.findFirst({ where: { name: 'Piotr Pietrzak' } });

    if (!wmsTeam || !dominik || !piotr) {
        console.log('Missing data components');
        return;
    }

    console.log(`WMS Team ID: ${wmsTeam.id}`);
    console.log(`Dominik ID: ${dominik.id}`);
    console.log(`Piotr ID: ${piotr.id}`);

    const sql = `
        SELECT
            DATE_TRUNC('hour', m.timestamp) as time,
            per.name AS metric,
            SUM(m."linesOfCode") AS value
        FROM (
            SELECT 
                timestamp,
                "projectId",
                "linesOfCode"
            FROM "ProjectMetric"
        ) m
        JOIN "Project" p ON m."projectId" = p.id
        JOIN "TeamProject" tp ON tp."projectId" = p.id
        JOIN "Team" t ON t.id = tp."teamId"
        JOIN "TeamMembership" tm ON tm."teamId" = t.id
        JOIN "Person" per ON per.id = tm."personId"
        WHERE 
            tp."teamId" = '${wmsTeam.id}'
            AND per.id IN ('${dominik.id}', '${piotr.id}')
        GROUP BY 1, 2
        ORDER BY 1, 2
    `;

    const results: any[] = await prisma.$queryRawUnsafe(sql);
    console.log(`Results for WMS team filter: ${results.length}`);

    const dominikRows = results.filter(r => r.metric === 'Dominik Tomiak');
    const piotrRows = results.filter(r => r.metric === 'Piotr Pietrzak');

    console.log(`Dominik rows: ${dominikRows.length}`);
    console.log(`Piotr rows: ${piotrRows.length}`);

    if (dominikRows.length > 0 && piotrRows.length > 0) {
        console.log('Latest comparison:');
        console.log('Dominik:', dominikRows[dominikRows.length - 1].value);
        console.log('Piotr:  ', piotrRows[piotrRows.length - 1].value);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
