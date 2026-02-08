const axios = require('axios');

const GRAFANA_URL = 'http://localhost:3000';
const AUTH = 'Basic ' + Buffer.from('admin:admin').toString('base64');
const DASHBOARD_UID = 'project-metrics';

async function fixCoverageColors() {
    try {
        console.log('Fetching dashboard...');
        const response = await axios.get(`${GRAFANA_URL}/api/dashboards/uid/${DASHBOARD_UID}`, {
            headers: { 'Authorization': AUTH }
        });

        const dashboard = response.data.dashboard;
        // Targeted panel: "Method Coverage History" (or similar)
        const coveragePanel = dashboard.panels.find(p => p.title.includes("Method Coverage") && (p.type === 'barchart' || p.type === 'timeseries'));

        if (coveragePanel) {
            console.log(`Found panel: '${coveragePanel.title}' (Type: ${coveragePanel.type})`);
            console.log("Updating configuration...");

            // 1. Force Color Mode to Palette Classic
            coveragePanel.fieldConfig.defaults.color = {
                mode: "palette-classic"
            };

            // 2. Remove Thresholds (often Defaults to Green/Red for coverage)
            // For Coverage, user might WANT thresholds (Red < 50, Green > 80), 
            // BUT they explicitly asked for "Same issue has to be fixed" -> implying "Different colors for different team/member/project".
            // So we prioritize Palette over Thresholds.
            coveragePanel.fieldConfig.defaults.thresholds = {
                mode: "absolute",
                steps: [
                    { color: "transparent", value: null } // reset
                ]
            };

            // 3. Add Transformation: Prepare Time Series (multiframe)
            // This is crucial for SQL Group By results to be seen as separate series
            coveragePanel.transformations = [
                {
                    id: "prepareTimeSeries",
                    options: {
                        format: "multi"
                    }
                }
            ];

            console.log("Transformation added: prepareTimeSeries (multi)");
        } else {
            console.log("Panel with 'Method Coverage' in title not found.");
            return;
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

fixCoverageColors();
