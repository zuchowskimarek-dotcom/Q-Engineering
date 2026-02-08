const axios = require('axios');

const GRAFANA_URL = 'http://localhost:3000';
const AUTH = 'Basic ' + Buffer.from('admin:admin').toString('base64');
const DASHBOARD_UID = 'project-metrics';

async function fixQueries() {
    try {
        const response = await axios.get(`${GRAFANA_URL}/api/dashboards/uid/${DASHBOARD_UID}`, {
            headers: { 'Authorization': AUTH }
        });

        const dashboard = response.data.dashboard;

        // Helper to wrap filtering in a way that doesn't duplicate rows
        // We use a subquery to check for Team/Member assignment without joining them to the main set
        const getFixedSql = (metricField, p_name_alias = 'metric', agg = null) => {
            const baseSql = `
SELECT
  ${agg ? `$__timeGroupAlias(timestamp,$__interval)` : `m.timestamp as time`},
  p.name AS ${p_name_alias},
  ${agg ? `${agg}(m."${metricField}")` : `m."${metricField}"`} AS value
FROM "ProjectMetric" m
JOIN "Project" p ON m."projectId" = p.id
WHERE 
  $__timeFilter(m.timestamp)
  AND (p.id IN ($project) OR 'all' IN ($project))
  AND EXISTS (
      SELECT 1 FROM "TeamProject" tp
      JOIN "TeamMembership" tm ON tp."teamId" = tm."teamId"
      WHERE tp."projectId" = p.id
      AND (tp."teamId" IN ($team) OR 'all' IN ($team))
      AND (tm."personId" IN ($member) OR 'all' IN ($member))
  )
${agg ? `GROUP BY 1, 2` : ''}
ORDER BY 1${agg ? ', 2' : ''}
`.trim();
            return baseSql;
        };

        dashboard.panels.forEach(panel => {
            if (panel.title === "Lines of Code over Time (Contextual)") {
                panel.targets[0].rawSql = getFixedSql('linesOfCode', 'metric');
            } else if (panel.title === "Commit Count over Time (Contextual)") {
                panel.targets[0].rawSql = getFixedSql('commitCount', 'metric');
            } else if (panel.title === "Code Churn over Time") {
                panel.targets[0].rawSql = getFixedSql('churn', 'metric', 'SUM');
            } else if (panel.title === "Method Coverage (Defined Unit Tests)") {
                panel.targets[0].rawSql = getFixedSql('coverage', 'metric', 'AVG');
            }
        });

        const updateResponse = await axios.post(`${GRAFANA_URL}/api/dashboards/db`, {
            dashboard: dashboard,
            overwrite: true
        }, {
            headers: { 'Authorization': AUTH }
        });

        console.log('Dashboard SQL fixed successfully:', updateResponse.data.status);
    } catch (error) {
        console.error('Error fixing dashboard SQL:', error.response?.data || error.message);
    }
}

fixQueries();
