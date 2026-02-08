import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const p = await prisma.person.findMany({ where: { name: { in: ['Dominik Tomiak', 'Piotr Pietrzak'] } } });
    const dom = p.find(x => x.name === 'Dominik Tomiak');
    const pit = p.find(x => x.name === 'Piotr Pietrzak');

    if (!dom || !pit) { console.log('Missing persons'); return; }

    const sql = `
        SELECT
            time,
            metric,
            SUM(diff) OVER (PARTITION BY metric ORDER BY time) as value
        FROM (
            SELECT
                DATE_TRUNC('hour', pam.timestamp) as time,
                per.name as metric,
                SUM(pam.additions - pam.deletions) as diff
            FROM "ProjectAuthorMetric" pam
            JOIN "Person" per ON pam."personId" = per.id
            WHERE per.id IN ('${dom.id}', '${pit.id}')
            GROUP BY 1, 2
        ) sub
        ORDER BY 1, 2
    `;

    const results: any[] = await prisma.$queryRawUnsafe(sql);
    console.log(`Cumulative LOC Results: ${results.length}`);
    results.forEach(r => console.log(`${r.time.toISOString()} | ${r.metric.padEnd(20)} | ${r.value}`));
}

main().catch(console.error).finally(() => prisma.$disconnect());
