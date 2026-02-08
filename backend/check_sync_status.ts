
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkSync() {
    try {
        console.log("--- Checking Repository Sync Status ---");

        const repos = await prisma.repository.findMany();

        console.table(repos.map(r => ({
            name: r.name,
            status: r.syncStatus,
            lastSynced: r.lastSyncedAt?.toISOString()
        })));

    } catch (e: any) {
        console.error("Error:", e.message);
    } finally {
        await prisma.$disconnect();
    }
}

checkSync();
