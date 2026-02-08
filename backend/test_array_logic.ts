
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function runTest() {
    try {
        console.log("--- Testing Postgres Array Logic for UUIDs ---");

        const team = await prisma.team.findFirst();
        if (!team) return;

        const uuid = team.id;
        console.log(`Testing with UUID: ${uuid}`);

        // Scenario 1: Single Value (simulating raw unquoted variable)
        // Variable $team = uuid
        // SQL: string_to_array('uuid', ',')
        const sqlSingle = `
            SELECT count(*) as count 
            FROM "Team" 
            WHERE id::text = ANY(string_to_array('${uuid}', ','))
        `;
        const resSingle = await prisma.$queryRawUnsafe(sqlSingle);
        console.log(`Single Value Match: ${(resSingle as any[])[0].count} (Expected 1)`);

        // Scenario 2: Multi Value (simulating csv variable)
        // Variable $team = uuid1,uuid2
        // SQL: string_to_array('uuid1,uuid2', ',')
        const sqlMulti = `
            SELECT count(*) as count 
            FROM "Team" 
            WHERE id::text = ANY(string_to_array('${uuid},00000000-0000-0000-0000-000000000000', ','))
        `;
        const resMulti = await prisma.$queryRawUnsafe(sqlMulti);
        console.log(`Multi Value Match:  ${(resMulti as any[])[0].count} (Expected 1)`);

        if ((resSingle as any[])[0].count > 0 && (resMulti as any[])[0].count > 0) {
            console.log("SUCCESS: Array logic works for both single and multi values!");
        } else {
            console.log("FAIL: Logic flawed.");
        }

    } catch (e: any) {
        console.error("Error:", e.message);
    } finally {
        await prisma.$disconnect();
    }
}

runTest();
