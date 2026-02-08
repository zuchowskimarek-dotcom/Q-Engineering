import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const metrics = await prisma.projectAuthorMetric.findMany({
        where: {
            gitEmail: { contains: 'dominik', mode: 'insensitive' }
        },
        include: {
            project: true
        }
    });

    console.log('Metrics for Dominik with Project Names:');
    metrics.forEach(m => {
        console.log(`- Project: ${m.project.name} | Additions: ${m.additions} | Commits: ${m.commitCount} | Timestamp: ${m.timestamp}`);
    });

    const person = await prisma.person.findFirst({
        where: { name: { contains: 'Dominik', mode: 'insensitive' } }
    });
    console.log('Person record for Dominik:');
    console.log(JSON.stringify(person, null, 2));
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
