import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const p = await prisma.person.findMany({ where: { name: { in: ['Dominik Tomiak', 'Piotr Pietrzak'] } } });
    const dom = p.find(x => x.name === 'Dominik Tomiak');
    const pit = p.find(x => x.name === 'Piotr Pietrzak');

    if (!dom || !pit) { console.log('Missing persons'); return; }

    const sql = `
        SELECT
            pam.timestamp as time,
            per.name AS metric,
            (pam.additions + pam.deletions) AS value
        FROM "ProjectAuthorMetric" pam
        JOIN "Project" pr ON pam."projectId" = pr.id
        LEFT JOIN "Person" per ON pam."personId" = per.id
        WHERE 
            per.id IN ('${dom.id}', '${pit.id}')
            AND pr.name = 'wes/wms'
        ORDER BY 1, 2
    `;

    const results: any[] = await prisma.$queryRawUnsafe(sql);
    console.log(`Results for wes/wms: ${results.length}`);
    results.forEach(r => console.log(`${r.time.toISOString()} | ${r.metric.padEnd(20)} | ${r.value}`));
}

main().catch(console.error).finally(() => prisma.$disconnect());
