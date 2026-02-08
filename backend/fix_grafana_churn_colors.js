const axios = require('axios');

const GRAFANA_URL = 'http://localhost:3000';
const AUTH = 'Basic ' + Buffer.from('admin:admin').toString('base64');
const DASHBOARD_UID = 'project-metrics';

async function fixChurnColors() {
    try {
        console.log('Fetching dashboard...');
        const response = await axios.get(`${GRAFANA_URL}/api/dashboards/uid/${DASHBOARD_UID}`, {
            headers: { 'Authorization': AUTH }
        });

        const dashboard = response.data.dashboard;
        const churnPanel = dashboard.panels.find(p => p.title === "Code Churn over Time");

        if (churnPanel) {
            console.log("Updating 'Code Churn over Time' panel...");

            // 1. Force Color Mode to Palette Classic
            churnPanel.fieldConfig.defaults.color = {
                mode: "palette-classic"
            };

            // 2. Remove Thresholds (so it doesn't default to Green)
            churnPanel.fieldConfig.defaults.thresholds = {
                mode: "absolute",
                steps: [
                    { color: "transparent", value: null } // reset
                ]
            };

            // 3. Add Transformation: Labels to Fields (or Prepare Time Series)
            // The SQL returns [Time, Metric, Value]. 
            // Grafana needs to pivot this "Metric" column to proper Series.
            // "prepareTimeSeries" with format "multi" usually does this for Long data.
            churnPanel.transformations = [
                {
                    id: "prepareTimeSeries",
                    options: {
                        format: "multi"
                    }
                }
            ];

            // 4. Ensure stacking is on (optional, but good for aggregate view)
            // churnPanel.options.stacking = "normal"; // Keeping as is

            console.log("Transformation added: prepareTimeSeries (multi)");
        }

        console.log('Sending update to Grafana...');
        const updateResponse = await axios.post(`${GRAFANA_URL}/api/dashboards/db`, {
            dashboard: dashboard,
            overwrite: true
        }, {
            headers: { 'Authorization': AUTH }
        });

        console.log('Dashboard updated successfully:', updateResponse.data.status);
    } catch (error) {
        console.error('Error fixing dashboard:', error.response?.data || error.message);
    }
}

fixChurnColors();
