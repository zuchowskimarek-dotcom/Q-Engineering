
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function runDebug() {
    try {
        console.log("--- Debugging Project Visibility ---");

        // 1. Find Team "MFC"
        const team = await prisma.team.findFirst({
            where: { name: { contains: 'MFC', mode: 'insensitive' } },
            include: { projects: { include: { project: true } } }
        });

        if (!team) {
            console.error("Team MFC not found!");
            return;
        }

        console.log(`Team: ${team.name} (${team.id})`);
        console.log(`Assigned Projects: ${team.projects.length}`);

        if (team.projects.length === 0) {
            console.log("No projects assigned to this team.");
            return;
        }

        // 2. Check isSelected status
        team.projects.forEach(tp => {
            console.log(` - Project: ${tp.project.name} | ID: ${tp.project.id} | isSelected: ${tp.project.isSelected}`);
        });

        // 3. Simulate Grafana Variable Query
        // Query: SELECT DISTINCT p.id ... WHERE tp."teamId" IN ('UUID') AND p."isSelected" = true

        console.log("\n--- Simulating Variable Query SQL ---");
        const sql = `
            SELECT DISTINCT p.id as value, p.name as text 
            FROM "Project" p 
            JOIN "TeamProject" tp ON p.id = tp."projectId" 
            WHERE tp."teamId" IN ('${team.id}') 
            AND p."isSelected" = true 
            ORDER BY p.name
        `;

        const result = await prisma.$queryRawUnsafe(sql);
        console.log(`Row Count: ${(result as any[]).length}`);

        if ((result as any[]).length === 0) {
            console.log("[FAIL] Variable Query returns 0 rows. This explains why the dropdown is empty.");

            // detailed check
            const openSql = `
                SELECT DISTINCT p.id, p.name, p."isSelected"
                FROM "Project" p 
                JOIN "TeamProject" tp ON p.id = tp."projectId" 
                WHERE tp."teamId" IN ('${team.id}')
            `;
            const resultOpen = await prisma.$queryRawUnsafe(openSql);
            console.log("Check without 'isSelected=true' filter:");
            console.table(resultOpen);
        } else {
            console.log("[SUCCESS] Variable Query returns rows in backend.");
            console.log((result as any[])[0]);
        }

    } catch (e: any) {
        console.error("Error:", e.message);
    } finally {
        await prisma.$disconnect();
    }
}

runDebug();
