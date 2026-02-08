const axios = require('axios');

const GRAFANA_URL = 'http://localhost:3000';
const AUTH = 'Basic ' + Buffer.from('admin:admin').toString('base64');
const DASHBOARD_UID = 'project-metrics';

async function fixQueries() {
    try {
        console.log('Fetching dashboard...');
        const response = await axios.get(`${GRAFANA_URL}/api/dashboards/uid/${DASHBOARD_UID}`, {
            headers: { 'Authorization': AUTH }
        });

        const dashboard = response.data.dashboard;

        const projectFilter = "($project = 'all' OR p.id::text IN ($project))";
        const teamFilter = "($team = 'all' OR tp.\"teamId\"::text IN ($team))";
        const memberFilter = "($member = 'all' OR tm.\"personId\"::text IN ($member))";

        const getDynamicAuthorSql = (metricExpr, title) => {
            return `
-- Group By: $view_by | ${title}
SELECT
  $__timeGroupAlias(pam.timestamp,$__interval),
  CASE 
    WHEN '$view_by' = 'team' THEN t.name
    WHEN '$view_by' = 'member' THEN COALESCE(per.name, pam."gitEmail")
    ELSE p.name 
  END AS metric,
  SUM(${metricExpr}) AS value
FROM "ProjectAuthorMetric" pam
JOIN "Project" p ON pam."projectId" = p.id
LEFT JOIN "Person" per ON pam."personId" = per.id
JOIN "TeamProject" tp ON tp."projectId" = p.id
JOIN "Team" t ON t.id = tp."teamId"
JOIN "TeamMembership" tm ON tm."teamId" = t.id
WHERE 
  $__timeFilter(pam.timestamp)
  AND ${projectFilter}
  AND ${teamFilter}
  AND ${memberFilter}
  AND (pam."personId" = tm."personId" OR (pam."personId" IS NULL AND pam."gitEmail" IN (SELECT email FROM "Person" WHERE id = tm."personId")))
GROUP BY 1, 2
ORDER BY 1, 2
`.trim();
        };

        const getDynamicProjectStateSql = (metricField, agg = 'SUM', title) => {
            return `
-- Group By: $view_by | ${title}
SELECT
  $__timeGroupAlias(m.timestamp,$__interval),
  CASE 
    WHEN '$view_by' = 'team' THEN t.name
    WHEN '$view_by' = 'member' THEN per.name
    ELSE p.name 
  END AS metric,
  ${agg}(m."${metricField}") AS value
FROM (
    -- First, get the latest metric per project per interval to avoid double counting if multiple syncs happened
    SELECT 
        $__timeGroup(timestamp, $__interval) as timestamp,
        "projectId",
        MAX("${metricField}") as "${metricField}"
    FROM "ProjectMetric"
    WHERE $__timeFilter(timestamp)
    GROUP BY 1, 2
) m
JOIN "Project" p ON m."projectId" = p.id
JOIN "TeamProject" tp ON tp."projectId" = p.id
JOIN "Team" t ON t.id = tp."teamId"
JOIN "TeamMembership" tm ON tm."teamId" = t.id
JOIN "Person" per ON per.id = tm."personId"
WHERE 
  ${projectFilter}
  AND ${teamFilter}
  AND ${memberFilter}
GROUP BY 1, 2
ORDER BY 1, 2
`.trim();
        };

        dashboard.panels.forEach(panel => {
            console.log(`Processing panel: ${panel.title}`);
            if (panel.title === "Commit Count over Time (Contextual)") {
                panel.targets[0].rawSql = getDynamicAuthorSql('pam."commitCount"', panel.title);
            } else if (panel.title === "Code Churn over Time") {
                panel.targets[0].rawSql = getDynamicAuthorSql('pam.additions + pam.deletions', panel.title);
            } else if (panel.title === "Lines of Code over Time (Contextual)") {
                panel.targets[0].rawSql = getDynamicProjectStateSql('linesOfCode', 'SUM', panel.title);
            } else if (panel.title === "Method Coverage (Defined Unit Tests)") {
                panel.targets[0].rawSql = getDynamicProjectStateSql('coverage', 'AVG', panel.title);
            } else if (panel.title === "Developer Activity (Contextual)") {
                panel.targets[0].rawSql = getDynamicAuthorSql('pam.additions', panel.title);
            }
        });

        console.log('Sending update to Grafana...');
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
