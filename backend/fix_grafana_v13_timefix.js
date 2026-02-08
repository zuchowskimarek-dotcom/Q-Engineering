const axios = require('axios');

const GRAFANA_URL = 'http://localhost:3000';
const AUTH = 'Basic ' + Buffer.from('admin:admin').toString('base64');
const DASHBOARD_UID = 'project-metrics';

async function fixTimeRange() {
    try {
        console.log('Fetching dashboard...');
        const response = await axios.get(`${GRAFANA_URL}/api/dashboards/uid/${DASHBOARD_UID}`, {
            headers: { 'Authorization': AUTH }
        });

        const dashboard = response.data.dashboard;

        console.log('Current Time Range:', dashboard.time);

        // Diagnosis: Data in DB is from 10:08 AM.
        // Current Time is 23:40 PM.
        // Default "Last 6 hours" = 17:40 - 23:40.
        // Data is outside the window.
        // Fix: Set default to "Last 24 hours".

        dashboard.time = { from: 'now-24h', to: 'now' };

        // Also ensure auto-refresh is reasonable
        dashboard.refresh = "5s";

        console.log('New Time Range:', dashboard.time);

        console.log('Sending update to Grafana...');
        const updateResponse = await axios.post(`${GRAFANA_URL}/api/dashboards/db`, {
            dashboard: dashboard,
            overwrite: true
        }, {
            headers: { 'Authorization': AUTH }
        });

        console.log('Dashboard Time Range fixed successfully:', updateResponse.data.status);

    } catch (error) {
        console.error('Error fixing dashboard:', error.response?.data || error.message);
    }
}

fixTimeRange();
