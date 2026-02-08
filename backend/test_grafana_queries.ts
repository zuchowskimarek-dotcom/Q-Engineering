
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// The SQL logic from v9 (simplified for testing)
const generateSql = (viewBy: string, teamIds: string[], projectIds: string[], memberIds: string[] | string) => {
    // Grafana injects variables as CSV strings: "'id1','id2'"
    // We emulate this by joining with quotes
    const formatVar = (ids: string[]) => ids.length > 0 ? ids.map(id => `'${id}'`).join(',') : "''";

    // Logic from v9
    const teamFilterSubquery = `p.id IN (SELECT "projectId" FROM "TeamProject" WHERE "teamId" IN (${formatVar(teamIds)}))`;
    const projectFilter = `p.id IN (${formatVar(projectIds)})`;

    // Simplification for member filter test
    const memberFilter = `(1=1)`;

    return `
        SELECT
            p.name as metric,
            COUNT(*) as value
        FROM "ProjectMetric" m
        JOIN "Project" p ON m."projectId" = p.id
        LEFT JOIN "TeamProject" tp ON tp."projectId" = p.id AND '${viewBy}' = 'team'
        LEFT JOIN "Team" t ON t.id = tp."teamId"
        WHERE 
            ${teamFilterSubquery}
            AND ${projectFilter}
        GROUP BY p.name
        LIMIT 5;
    `;
};

async function runTest() {
    try {
        console.log("--- 1. Fetching Real Data for Test Case ---");
        const teams = await prisma.team.findMany({ take: 3 });
        const projects = await prisma.project.findMany({ take: 3 });

        if (teams.length === 0 || projects.length === 0) {
            console.error("Not enough data to test. Need teams and projects.");
            return;
        }

        const teamIds = teams.map(t => t.id);
        const projectIds = projects.map(p => p.id); // In "All" mode, all IDs are sent

        console.log(`Testing with Teams: ${teamIds.length}, Projects: ${projectIds.length}`);

        console.log("\n--- 2. Simulating 'All Selected' (Group By Project) ---");
        const sqlAll = generateSql('project', teamIds, projectIds, 'all');
        console.log("Executing SQL (Preview):", sqlAll.substring(0, 200) + "...");

        const resultAll = await prisma.$queryRawUnsafe(sqlAll);
        console.log(`Result Count: ${(resultAll as any[]).length}`);
        if ((resultAll as any[]).length === 0) console.log("FAILURE: No data returned for standard view.");
        else console.log("SUCCESS: Data returned.");

        console.log("\n--- 3. Simulating 'Single Team Selected' ---");
        // For a single team, Grafana sends one ID. 
        // Important: Project list is filtered by frontend variable query, so it only sends projects valid for that team.
        const singleTeamId = [teamIds[0]];
        // Find projects for this team to simulate correct variable cascading
        const linkedProjects = await prisma.project.findMany({
            where: { teams: { some: { teamId: singleTeamId[0] } } }
        });
        const linkedProjectIds = linkedProjects.map(p => p.id);

        if (linkedProjectIds.length > 0) {
            const sqlSingle = generateSql('project', singleTeamId, linkedProjectIds, 'all');
            const resultSingle = await prisma.$queryRawUnsafe(sqlSingle);
            console.log(`Result Count for Team ${teams[0].name}: ${(resultSingle as any[]).length}`);
        } else {
            console.log("Skipping single team test (no projects linked to first team).");
        }

    } catch (e: any) {
        console.error("Test Failed:", e.message);
    } finally {
        await prisma.$disconnect();
    }
}

runTest();
