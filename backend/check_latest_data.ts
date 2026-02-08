
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkData() {
    try {
        console.log("--- Checking Data Existence and Freshness ---");

        const count = await prisma.projectMetric.count();
        console.log(`Total Metric Rows: ${count}`);

        if (count === 0) {
            console.error("FATAL: ProjectMetric table is EMPTY.");
            return;
        }

        const latest = await prisma.projectMetric.findFirst({
            orderBy: { timestamp: 'desc' }
        });

        console.log(`Latest Timestamp: ${latest?.timestamp}`);

        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

        if (latest && latest.timestamp < oneYearAgo) {
            console.error("ALERT: Latest data is older than 1 year. The default time filter will exclude everything!");
        } else {
            console.log("INFO: Data is recent.");
        }

        console.log("\n--- Checking Team/Project Links ---");
        const tpCount = await prisma.teamProject.count();
        console.log(`Team-Project Links: ${tpCount}`);

    } catch (e: any) {
        console.error("Error:", e.message);
    } finally {
        await prisma.$disconnect();
    }
}

checkData();
