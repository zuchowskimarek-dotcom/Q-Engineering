const axios = require('axios');

const GRAFANA_URL = 'http://localhost:3000';
const AUTH = 'Basic ' + Buffer.from('admin:admin').toString('base64');
const DASHBOARD_UID = 'project-metrics';

async function getQueries() {
    try {
        const response = await axios.get(`${GRAFANA_URL}/api/dashboards/uid/${DASHBOARD_UID}`, {
            headers: { 'Authorization': AUTH }
        });

        const dashboard = response.data.dashboard;
        const coveragePanel = dashboard.panels.find(p => p.title.includes("Method Coverage"));

        if (coveragePanel) {
            console.log("--- Method Coverage SQL ---");
            coveragePanel.targets.forEach(t => {
                console.log(t.rawSql);
            });
        }

    } catch (error) {
        console.error('Error:', error.message);
    }
}

getQueries();
