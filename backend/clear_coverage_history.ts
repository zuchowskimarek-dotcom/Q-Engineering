
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function clearCoverage() {
    try {
        console.log("--- Clearing Historical Coverage Data ---");

        // Update all metrics to have 0 coverage
        const result = await prisma.projectMetric.updateMany({
            data: {
                coverage: 0
            }
        });

        console.log(`Updated ${result.count} metric records. All coverage set to 0.`);

    } catch (e: any) {
        console.error("Error:", e.message);
    } finally {
        await prisma.$disconnect();
    }
}

clearCoverage();
