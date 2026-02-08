const axios = require('axios');

const GRAFANA_URL = 'http://localhost:3000';
const AUTH = 'Basic ' + Buffer.from('admin:admin').toString('base64');
const DASHBOARD_UID = 'project-metrics';

async function inspectVariables() {
    try {
        console.log('Fetching dashboard...');
        const response = await axios.get(`${GRAFANA_URL}/api/dashboards/uid/${DASHBOARD_UID}`, {
            headers: { 'Authorization': AUTH }
        });

        const dashboard = response.data.dashboard;
        const variables = dashboard.templating.list;

        console.log('\n--- Dashboard Variables ---');
        variables.forEach(v => {
            console.log(`\nName: $${v.name} (Type: ${v.type})`);
            console.log(`Query: ${v.query}`);
            if (v.query.includes('${team:sqlstring}')) {
                console.log("   [OK] Contains ${team:sqlstring}");
            } else if (v.type === 'query' && v.name !== 'team') {
                console.log("   [WARN] Missing explicit sqlstring formatting?");
            }
        });

    } catch (error) {
        console.error('Error fetching dashboard:', error.message);
    }
}

inspectVariables();
