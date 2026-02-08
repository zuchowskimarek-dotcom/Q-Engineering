import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkWms() {
    try {
        const teams = await prisma.team.findMany({
            where: { name: 'WMS' },
            include: {
                members: {
                    include: {
                        person: true
                    }
                },
                projects: {
                    include: {
                        project: true
                    }
                }
            }
        });

        console.log('--- WMS Teams ---');
        teams.forEach(t => {
            console.log(`Team: ${t.name} (ID: ${t.id})`);
            console.log('Members:');
            t.members.forEach(m => {
                console.log(` - ${m.person.name} (ID: ${m.person.id}, Email: ${m.person.email})`);
            });
            console.log('Projects:');
            t.projects.forEach(p => {
                console.log(` - ${p.project.name} (ID: ${p.project.id})`);
            });
        });

        // Also check contributors in ProjectAuthorMetric for these projects
        const projectIds = teams.flatMap(t => t.projects.map(p => p.projectId));
        const contributors = await prisma.projectAuthorMetric.groupBy({
            by: ['personId', 'gitEmail'],
            where: {
                projectId: { in: projectIds }
            },
            _sum: {
                commitCount: true
            }
        });

        console.log('\n--- Contributors for WMS Projects ---');
        for (const c of contributors) {
            let name = 'Unknown';
            if (c.personId) {
                const p = await prisma.person.findUnique({ where: { id: c.personId } });
                name = p?.name || 'Unknown';
            }
            console.log(` - ${name} (Email: ${c.gitEmail}), Commits: ${c._sum.commitCount}`);
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkWms();
