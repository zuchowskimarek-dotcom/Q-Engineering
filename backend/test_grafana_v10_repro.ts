
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// The logic from Fix V10
const generateSql = (viewBy: string, teamIdsString: string, projectIdsString: string) => {

    // Note: In V10, we use ${team:sqlstring}, which results in 'id1','id2' literal string in SQL.
    // In this test, we accept the pre-formatted string.

    const teamFilterSubquery = `p.id IN (SELECT "projectId" FROM "TeamProject" WHERE "teamId" IN (${teamIdsString}))`;
    const projectFilter = `p.id IN (${projectIdsString})`;

    // Dummy member filter string for now (ignoring member logic as we focus on team/project blocker)
    const memberFilter = `(1=1)`;

    return `
        SELECT
            p.name as metric,
            COUNT(*) as value
        FROM "ProjectMetric" m
        JOIN "Project" p ON m."projectId" = p.id
        LEFT JOIN "TeamProject" tp ON tp."projectId" = p.id AND '${viewBy}' = 'team' AND tp."teamId" IN (${teamIdsString})
        LEFT JOIN "Team" t ON t.id = tp."teamId"
        WHERE 
            m.timestamp > NOW() - INTERVAL '1 year'
            AND ${teamFilterSubquery}
            AND ${projectFilter}
        GROUP BY p.name
        LIMIT 5;
    `;
};

async function runTest() {
    try {
        console.log("--- 1. Inspecting Data ---");
        // Get Teams and their Project Counts
        const teams = await prisma.team.findMany({
            include: { projects: true }
        });

        const validTeams = teams.filter(t => t.projects.length > 0);
        console.log(`Total Teams: ${teams.length}`);
        console.log(`Teams with Projects: ${validTeams.length}`);

        if (validTeams.length === 0) {
            console.error("FATAL: No teams have assigned projects. The TeamProject table might be empty?");
            return;
        }

        const targetTeam = validTeams[0];
        console.log(`\nSelected Target Team: "${targetTeam.name}" (ID: ${targetTeam.id})`);
        console.log(`Assigned Projects: ${targetTeam.projects.length}`);

        // Get valid projects for this team to simulate linked variable
        const projectIds = targetTeam.projects.map(tp => `'${tp.projectId}'`).join(',');
        const teamIdString = `'${targetTeam.id}'`;

        console.log(`\n--- 2. Executing V10 Query for Single Team ---`);
        const sql = generateSql('project', teamIdString, projectIds);
        console.log("SQL Preview:\n", sql);

        const result = await prisma.$queryRawUnsafe(sql);
        console.log(`\nRows Returned: ${(result as any[]).length}`);

        if ((result as any[]).length === 0) {
            console.log("\n[FAIL] Query returned 0 rows despite team having projects.");
            console.log("Checking if ProjectMetric table has data for these projects...");

            const rawProjIds = targetTeam.projects.map(tp => tp.projectId);
            const metrics = await prisma.projectMetric.count({
                where: { projectId: { in: rawProjIds } }
            });
            console.log(`Metrics found for these projects: ${metrics}`);
        } else {
            console.log("\n[SUCCESS] Query returned data.");
            console.log("Sample:", (result as any[])[0]);
        }

    } catch (e: any) {
        console.error("Test Error:", e.message);
    } finally {
        await prisma.$disconnect();
    }
}

runTest();
