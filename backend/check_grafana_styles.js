
const axios = require('axios');

const GRAFANA_URL = 'http://localhost:3000';
const AUTH = 'Basic ' + Buffer.from('admin:admin').toString('base64');
const DASHBOARD_UID = 'project-metrics';

async function checkPanelStyles() {
    try {
        const response = await axios.get(`${GRAFANA_URL}/api/dashboards/uid/${DASHBOARD_UID}`, {
            headers: { 'Authorization': AUTH }
        });

        const dashboard = response.data.dashboard;
        const churnPanel = dashboard.panels.find(p => p.title === "Code Churn over Time");

        if (churnPanel) {
            console.log("--- Code Churn Panel Configuration ---");
            console.log("Type:", churnPanel.type);
            console.log("Field Config Defaults:", JSON.stringify(churnPanel.fieldConfig.defaults, null, 2));
            console.log("Overrides:", JSON.stringify(churnPanel.fieldConfig.overrides, null, 2));
            console.log("Options:", JSON.stringify(churnPanel.options, null, 2));
        } else {
            console.log("Panel 'Code Churn over Time' not found.");
        }

    } catch (error) {
        console.error('Error:', error.message);
    }
}

checkPanelStyles();
