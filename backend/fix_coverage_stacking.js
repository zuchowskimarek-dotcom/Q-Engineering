const axios = require('axios');

const GRAFANA_URL = 'http://localhost:3000';
const AUTH = 'Basic ' + Buffer.from('admin:admin').toString('base64');
const DASHBOARD_UID = 'project-metrics';

async function fixCoverageStacking() {
    try {
        console.log('Fetching dashboard...');
        const response = await axios.get(`${GRAFANA_URL}/api/dashboards/uid/${DASHBOARD_UID}`, {
            headers: { 'Authorization': AUTH }
        });

        const dashboard = response.data.dashboard;
        const coveragePanel = dashboard.panels.find(p => p.title.includes("Method Coverage"));

        if (coveragePanel) {
            console.log(`Found panel: '${coveragePanel.title}' (Type: ${coveragePanel.type})`);

            // Fix Stacking
            if (coveragePanel.type === 'barchart' || coveragePanel.type === 'timeseries') {
                if (!coveragePanel.fieldConfig) coveragePanel.fieldConfig = { defaults: {}, overrides: [] };

                // For BarChart panel
                if (coveragePanel.options) {
                    console.log(`Current Stacking: ${coveragePanel.options.stacking}`);
                    // Change to "none" (Side-by-side)
                    coveragePanel.options.stacking = "none";
                }

                // Also ensure it's not trying to stack 100%
                if (coveragePanel.fieldConfig.defaults.custom) {
                    coveragePanel.fieldConfig.defaults.custom.stacking = { mode: "none" };
                }
            }

            console.log("Updated stacking to 'none'.");

            console.log('Sending update to Grafana...');
            const updateResponse = await axios.post(`${GRAFANA_URL}/api/dashboards/db`, {
                dashboard: dashboard,
                overwrite: true
            }, {
                headers: { 'Authorization': AUTH }
            });

            console.log('Dashboard updated successfully:', updateResponse.data.status);

        } else {
            console.log("Panel not found.");
        }

    } catch (error) {
        console.error('Error fixing dashboard:', error.response?.data || error.message);
    }
}

fixCoverageStacking();
