const axios = require('axios');

const GRAFANA_URL = 'http://localhost:3000';
const AUTH = 'Basic ' + Buffer.from('admin:admin').toString('base64');
const DASHBOARD_UID = 'project-metrics';

async function updateQuery() {
    try {
        const response = await axios.get(`${GRAFANA_URL}/api/dashboards/uid/${DASHBOARD_UID}`, {
            headers: { 'Authorization': AUTH }
        });

        const dashboard = response.data.dashboard;
        const coveragePanel = dashboard.panels.find(p => p.title.includes("Method Coverage"));

        if (coveragePanel) {
            console.log("Updating SQL query...");
            // Force pure daily aggregation, picking the LAST value
            const newSql = `
SELECT
  date_trunc('day', m.timestamp) as time,
  CASE 
    WHEN '\${view_by}' = 'team' THEN t.name
    ELSE p.name 
  END AS metric,
  (array_agg(m."coverage" ORDER BY m.timestamp DESC))[1] AS value
FROM "ProjectMetric" m
JOIN "Project" p ON m."projectId" = p.id

LEFT JOIN "TeamProject" tp ON tp."projectId" = p.id AND '\${view_by}' = 'team' AND tp."teamId" IN (\${team:singlequote})
LEFT JOIN "Team" t ON t.id = tp."teamId"

WHERE 
  $__timeFilter(m.timestamp)
  AND p.id IN (\${project:singlequote})
GROUP BY 1, 2
ORDER BY 1, 2
`;
            coveragePanel.targets[0].rawSql = newSql.trim();

            // Also update "Code Churn" if desired? 
            // User said "there is no point...". They might mean globally.
            // Let's stick to METHOD COVERAGE as per request "seeing a coverage".
            // Coverage is state, Churn is event sum. Summing churn per day is correct. Averaging coverage is wrong.
            // Keeping Churn as Sum.

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

updateQuery();
