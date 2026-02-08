import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

function serialize(obj: any) {
    return JSON.stringify(obj, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value, 2
    );
}

async function checkMetric(title: string, sql: string) {
    console.log(`\n--- ${title} ---`);
    const results: any[] = await prisma.$queryRawUnsafe(sql);
    const dominik = results.filter(r => r.metric?.includes('Dominik'));
    const piotr = results.filter(r => r.metric?.includes('Piotr'));

    console.log(`Total rows: ${results.length}`);
    console.log(`Dominik rows: ${dominik.length}`);
    console.log(`Piotr rows: ${piotr.length}`);

    if (dominik.length > 0) {
        console.log(`Sample Dominik:`, serialize(dominik[dominik.length - 1]));
    }
    if (piotr.length > 0) {
        console.log(`Sample Piotr:`, serialize(piotr[piotr.length - 1]));
    }

    // Check for identical values at the same timestamps
    if (dominik.length > 0 && piotr.length > 0) {
        const matchingTimes = dominik.filter(d => piotr.some(p => p.time.toString() === d.time.toString()));
        console.log(`Identical timestamps: ${matchingTimes.length}`);

        const identicalValues = matchingTimes.filter(d => {
            const p = piotr.find(px => px.time.toString() === d.time.toString());
            return p && p.value.toString() === d.value.toString();
        });
        console.log(`Identical values at matching timestamps: ${identicalValues.length}`);
    }
}

async function main() {
    // Current SQL for "Lines of Code over Time"
    const locSql = `
        SELECT
            m.timestamp as time,
            per.name AS metric,
            SUM(m."linesOfCode") AS value
        FROM (
            SELECT 
                DATE_TRUNC('hour', timestamp) as timestamp,
                "projectId",
                MAX("linesOfCode") as "linesOfCode"
            FROM "ProjectMetric"
            GROUP BY 1, 2
        ) m
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

    // Current SQL for "Code Churn"
    const churnSql = `
        SELECT
            DATE_TRUNC('hour', pam.timestamp) as time,
            per.name AS metric,
            SUM(pam.additions + pam.deletions) AS value
        FROM "ProjectAuthorMetric" pam
        JOIN "Project" p ON pam."projectId" = p.id
        LEFT JOIN "Person" per ON pam."personId" = per.id
        JOIN "TeamProject" tp ON tp."projectId" = p.id
        JOIN "Team" t ON t.id = tp."teamId"
        JOIN "TeamMembership" tm ON tm."teamId" = t.id
        WHERE 
            per.name IN ('Dominik Tomiak', 'Piotr Pietrzak')
            AND (pam."personId" = tm."personId" OR (pam."personId" IS NULL AND pam."gitEmail" IN (SELECT email FROM "Person" WHERE id = tm."personId")))
        GROUP BY 1, 2
        ORDER BY 1, 2
    `;

    await checkMetric("Lines of Code", locSql);
    await checkMetric("Code Churn", churnSql);

    // Deep dive into ProjectAuthorMetric for Dominik
    const metrics = await prisma.projectAuthorMetric.findMany({
        where: { gitEmail: { contains: 'dominik' } },
        include: { person: true, project: true },
        orderBy: { timestamp: 'desc' },
        take: 5
    });
    console.log('\n--- Recent metrics for Dominik ---');
    console.log(serialize(metrics));
}

main().catch(console.error).finally(() => prisma.$disconnect());
