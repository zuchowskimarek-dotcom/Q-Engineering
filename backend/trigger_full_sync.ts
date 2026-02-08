
import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const API_URL = 'http://localhost:3001/api';

async function triggerSync() {
    try {
        console.log("--- Triggering Full Sync for All Repositories ---");

        const repos = await prisma.repository.findMany();
        console.log(`Found ${repos.length} repositories.`);

        for (const repo of repos) {
            console.log(`Syncing ${repo.name} (${repo.id})...`);
            try {
                await axios.post(`${API_URL}/repositories/${repo.id}/sync?since=24 hours ago`);
                console.log(` -> Triggered.`);
            } catch (e: any) {
                console.log(` -> Failed: ${e.message}`);
            }
        }

        console.log("\nSync triggered for all. Waiting 10 seconds for completion...");
        await new Promise(r => setTimeout(r, 10000));

    } catch (e: any) {
        console.error("Error:", e.message);
    } finally {
        await prisma.$disconnect();
    }
}

triggerSync();
