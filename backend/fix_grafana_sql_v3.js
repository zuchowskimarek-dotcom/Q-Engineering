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

        // Base filter logic for variables
        const projectFilter = '(p.id IN ($project) OR \'all\' IN ($project))';
        const teamFilter = '(tp."teamId" IN ($team) OR \'all\' IN ($team))';
        const memberFilter = '(tm."personId" IN ($member) OR \'all\' IN ($member))';

        // Helper to generate dynamic grouping SQL
        const getDynamicSql = (metricExpr, isSum = true) => {
            return `
-- Group By: $view_by
SELECT
  $__timeGroupAlias(pam.timestamp,$__interval),
  CASE 
    WHEN '$view_by' = 'team' THEN t.name
    WHEN '$view_by' = 'member' THEN COALESCE(per.name, pam."gitEmail")
    ELSE p.name 
  END AS metric,
  ${isSum ? `SUM(${metricExpr})` : `AVG(${metricExpr})`} AS value
FROM "ProjectAuthorMetric" pam
JOIN "Project" p ON pam."projectId" = p.id
LEFT JOIN "Person" per ON pam."personId" = per.id
-- Joins for filtering and team grouping
JOIN "TeamProject" tp ON tp."projectId" = p.id
JOIN "Team" t ON t.id = tp."teamId"
JOIN "TeamMembership" tm ON tm."teamId" = t.id
WHERE 
  $__timeFilter(pam.timestamp)
  AND ${projectFilter}
  AND ${teamFilter}
  AND ${memberFilter}
  -- Ensure author belongs to the team we are filtering by
  AND (pam."personId" = tm."personId" OR pam."gitEmail" IN (SELECT email FROM "Person" WHERE id = tm."personId"))
GROUP BY 1, 2
ORDER BY 1, 2
`.trim();
        };

        // Simpler SQL for LOC and Coverage (as they are usually project-level)
        const getProjectLevelSql = (metricField, agg = 'SUM') => {
            return `
SELECT
  $__timeGroupAlias(m.timestamp,$__interval),
  p.name AS metric,
  ${agg}(m."${metricField}") AS value
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
GROUP BY 1, 2
ORDER BY 1, 2
`.trim();
        };

        dashboard.panels.forEach(panel => {
            if (panel.title === "Commit Count over Time (Contextual)") {
                panel.targets[0].rawSql = getDynamicSql('pam."commitCount"');
            } else if (panel.title === "Code Churn over Time") {
                panel.targets[0].rawSql = getDynamicSql('pam.additions + pam.deletions');
            } else if (panel.title === "Lines of Code over Time (Contextual)") {
                panel.targets[0].rawSql = getProjectLevelSql('linesOfCode', 'MAX');
            } else if (panel.title === "Method Coverage (Defined Unit Tests)") {
                panel.targets[0].rawSql = getProjectLevelSql('coverage', 'AVG');
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
