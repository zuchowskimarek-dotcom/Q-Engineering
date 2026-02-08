
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkIntegrity() {
    try {
        console.log("--- Checking Project-Team Assignments ---");
        const totalProjects = await prisma.project.count();
        const totalTeams = await prisma.team.count();

        // Find projects that have at least one team assignment
        const projectsWithTeams = await prisma.project.count({
            where: {
                teams: { some: {} }
            }
        });

        const orphans = totalProjects - projectsWithTeams;

        console.log(`Total Projects: ${totalProjects}`);
        console.log(`Bound Projects: ${projectsWithTeams}`);
        console.log(`Orphan Projects: ${orphans}`);
        console.log(`Total Teams:    ${totalTeams}`);

        if (orphans > 0) {
            console.log("ALERT: You have orphaned projects. These are EXCLUDED by the current strict filter logic when selecting 'All Teams'.");
        } else {
            console.log("INFO: All projects are assigned to at least one team. Strict filtering should work fine.");
        }

    } catch (e: any) {
        console.error("Error:", e.message);
    } finally {
        await prisma.$disconnect();
    }
}

checkIntegrity();
