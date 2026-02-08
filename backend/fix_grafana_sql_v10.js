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

        // V10 Improvements:
        // 1. Use ${var:sqlstring} to force 'id1','id2' format
        // 2. Filter the LEFT JOINed teams to only include selected ones (prevents showing unselected teams for shared projects)

        const teamFilterSubquery = `p.id IN (SELECT "projectId" FROM "TeamProject" WHERE "teamId" IN (\${team:sqlstring}))`;
        const projectFilter = `p.id IN (\${project:sqlstring})`;

        const getMemberFilter = (tableAlias) => `
          (
            ${tableAlias}."personId" IN (\${member:sqlstring})
            OR 
            (${tableAlias}."personId" IS NULL AND ${tableAlias}."gitEmail" IN (SELECT email FROM "Person" WHERE id IN (\${member:sqlstring})))
          )
        `;

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

-- Conditional Join:
-- Only join teams if grouping by Team.
-- AND only join teams that are actually SELECTED in the filter (tp."teamId" IN ($team)).
-- This ensures if P1 is in Team A and B, but only A is selected, we only show A.
LEFT JOIN "TeamProject" tp ON tp."projectId" = p.id AND '$view_by' = 'team' AND tp."teamId" IN (\${team:sqlstring})
LEFT JOIN "Team" t ON t.id = tp."teamId"

WHERE 
  $__timeFilter(pam.timestamp)
  AND ${teamFilterSubquery}
  AND ${projectFilter}
  AND ${getMemberFilter('pam')}
  
GROUP BY 1, 2
ORDER BY 1, 2
`.trim();
        };

        const getLocSql = () => {
            return `
-- Group By: $view_by | Lines of Code
SELECT
  time,
  metric,
  CASE WHEN '$view_by' = 'member' THEN SUM(val) OVER (PARTITION BY metric ORDER BY time) ELSE val END as value
FROM (
  SELECT
    $__timeGroupAlias(m.timestamp,$__interval),
    CASE WHEN '$view_by' = 'team' THEN t.name ELSE p.name END as metric,
    MAX(m."linesOfCode")::bigint as val
  FROM "ProjectMetric" m
  JOIN "Project" p ON m."projectId" = p.id
  
  LEFT JOIN "TeamProject" tp ON tp."projectId" = p.id AND '$view_by' = 'team' AND tp."teamId" IN (\${team:sqlstring})
  LEFT JOIN "Team" t ON t.id = tp."teamId"

  WHERE 
    $__timeFilter(m.timestamp)
    AND ${teamFilterSubquery}
    AND ${projectFilter}
    AND '$view_by' != 'member'
  GROUP BY 1, 2

  UNION ALL

  SELECT
    $__timeGroupAlias(pam.timestamp,$__interval),
    COALESCE(per.name, pam."gitEmail") as metric,
    SUM(pam.additions - pam.deletions)::bigint as val
  FROM "ProjectAuthorMetric" pam
  JOIN "Project" p ON pam."projectId" = p.id
  LEFT JOIN "Person" per ON pam."personId" = per.id
  
  WHERE 
    $__timeFilter(pam.timestamp)
    AND ${teamFilterSubquery}
    AND ${projectFilter}
    AND ${getMemberFilter('pam')}
    AND '$view_by' = 'member'
  GROUP BY 1, 2
) sub
ORDER BY 1, 2
`.trim();
        };

        dashboard.panels.forEach(panel => {
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
    ELSE p.name 
  END AS metric,
  AVG(m."coverage") AS value
FROM "ProjectMetric" m
JOIN "Project" p ON m."projectId" = p.id

LEFT JOIN "TeamProject" tp ON tp."projectId" = p.id AND '$view_by' = 'team' AND tp."teamId" IN (\${team:sqlstring})
LEFT JOIN "Team" t ON t.id = tp."teamId"

WHERE 
  $__timeFilter(m.timestamp)
  AND ${teamFilterSubquery}
  AND p.id IN (\${project:sqlstring})
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

        console.log('Dashboard SQL fixed successfully (v10 - Explicit Formatting):', updateResponse.data.status);
    } catch (error) {
        console.error('Error fixing dashboard SQL:', error.response?.data || error.message);
    }
}

fixQueries();
