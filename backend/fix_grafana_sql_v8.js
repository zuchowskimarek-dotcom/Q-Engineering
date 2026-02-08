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
        const teamFilter = "($team = 'all' OR t.id::text IN ($team))";
        const memberFilter = "($member = 'all' OR tm.\"personId\"::text IN ($member))";

        // Dynamic Author Metrics (Churn, Commits, Activity)
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

        // Lines of Code (Special handling for Member view)
        const getLocSql = () => {
            return `
-- Group By: $view_by | Lines of Code
SELECT
  time,
  metric,
  CASE WHEN '$view_by' = 'member' THEN SUM(val) OVER (PARTITION BY metric ORDER BY time) ELSE val END as value
FROM (
  -- Project/Team View (Raw LOC)
  SELECT
    $__timeGroupAlias(m.timestamp,$__interval),
    CASE WHEN '$view_by' = 'team' THEN t.name ELSE p.name END as metric,
    MAX(m."linesOfCode")::bigint as val
  FROM "ProjectMetric" m
  JOIN "Project" p ON m."projectId" = p.id
  JOIN "TeamProject" tp ON tp."projectId" = p.id
  JOIN "Team" t ON t.id = tp."teamId"
  JOIN "TeamMembership" tm ON tm."teamId" = t.id
  WHERE 
    $__timeFilter(m.timestamp)
    AND ${projectFilter}
    AND ${teamFilter}
    AND ${memberFilter}
    AND '$view_by' != 'member'
  GROUP BY 1, 2

  UNION ALL

  -- Member View (Cumulative Net Change)
  SELECT
    $__timeGroupAlias(pam.timestamp,$__interval),
    COALESCE(per.name, pam."gitEmail") as metric,
    SUM(pam.additions - pam.deletions)::bigint as val
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
    AND '$view_by' = 'member'
    AND (pam."personId" = tm."personId" OR (pam."personId" IS NULL AND pam."gitEmail" IN (SELECT email FROM "Person" WHERE id = tm."personId")))
  GROUP BY 1, 2
) sub
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
                panel.targets[0].rawSql = getLocSql();
            } else if (panel.title === "Developer Activity (Contextual)") {
                panel.targets[0].rawSql = getDynamicAuthorSql('pam.additions', panel.title);
            } else if (panel.title === "Method Coverage (Defined Unit Tests)") {
                panel.targets[0].rawSql = `
SELECT
  $__timeGroupAlias(m.timestamp,$__interval),
  CASE 
    WHEN '$view_by' = 'team' THEN t.name
    WHEN '$view_by' = 'member' THEN per.name
    ELSE p.name 
  END AS metric,
  AVG(m."coverage") AS value
FROM "ProjectMetric" m
JOIN "Project" p ON m."projectId" = p.id
JOIN "TeamProject" tp ON tp."projectId" = p.id
JOIN "Team" t ON t.id = tp."teamId"
JOIN "TeamMembership" tm ON tm."teamId" = t.id
JOIN "Person" per ON per.id = tm."personId"
WHERE 
  $__timeFilter(m.timestamp)
  AND ${projectFilter}
  AND ${teamFilter}
  AND ${memberFilter}
GROUP BY 1, 2
ORDER BY 1, 2
`.trim();
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
