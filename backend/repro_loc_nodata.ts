import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function testLocSql(viewBy: string) {
    console.log(`\n--- Testing View By: ${viewBy} ---`);

    const projectVar = "'all'";
    const teamVar = "'all'";
    const memberVar = "'all'";
    const timeFilter = "timestamp >= '2026-01-01'";

    const sql = `
        SELECT
            time,
            metric,
            CASE WHEN '${viewBy}' = 'member' THEN SUM(val) OVER (PARTITION BY metric ORDER BY time) ELSE val END as value
        FROM (
            -- Project/Team View (Raw LOC)
            SELECT
                DATE_TRUNC('hour', m.timestamp) as time,
                CASE WHEN '${viewBy}' = 'team' THEN t.name ELSE p.name END as metric,
                MAX(m."linesOfCode") as val
            FROM "ProjectMetric" m
            JOIN "Project" p ON m."projectId" = p.id
            JOIN "TeamProject" tp ON tp."projectId" = p.id
            JOIN "Team" t ON t.id = tp."teamId"
            JOIN "TeamMembership" tm ON tm."teamId" = t.id
            WHERE 
                ${timeFilter}
                AND ('all' = 'all') -- simplified
                AND '${viewBy}' != 'member'
            GROUP BY 1, 2

            UNION ALL

            -- Member View (Cumulative Net Change)
            SELECT
                DATE_TRUNC('hour', pam.timestamp) as time,
                COALESCE(per.name, pam."gitEmail") as metric,
                SUM(pam.additions - pam.deletions) as val
            FROM "ProjectAuthorMetric" pam
            JOIN "Project" p ON pam."projectId" = p.id
            LEFT JOIN "Person" per ON pam."personId" = per.id
            JOIN "TeamProject" tp ON tp."projectId" = p.id
            JOIN "Team" t ON t.id = tp."teamId"
            JOIN "TeamMembership" tm ON tm."teamId" = t.id
            WHERE 
                ${timeFilter}
                AND ('all' = 'all') -- simplified
                AND '${viewBy}' = 'member'
                AND (pam."personId" = tm."personId" OR (pam."personId" IS NULL AND pam."gitEmail" IN (SELECT email FROM "Person" WHERE id = tm."personId")))
            GROUP BY 1, 2
        ) sub
        ORDER BY 1, 2
    `;

    try {
        const results: any[] = await prisma.$queryRawUnsafe(sql);
        console.log(`Results for ${viewBy}: ${results.length}`);
        if (results.length > 0) {
            console.log('Value Type:', typeof results[0].value);
            console.log('Value Instance:', results[0].value?.constructor?.name);
            console.log('Sample Result:', JSON.stringify(results[0], (k, v) => typeof v === 'bigint' ? v.toString() : v, 2));
        }
    } catch (e: any) {
        console.error('SQL Error:', e.message);
    }
}

async function main() {
    await testLocSql('project');
    await testLocSql('member');
}

main().catch(console.error).finally(() => prisma.$disconnect());
