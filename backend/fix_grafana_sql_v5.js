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

    // Base filter logic using IN clause which Grafana handles correctly for multi-value variables
    // We use string_to_array and ANY to be extra safe if Grafana sends it differently, 
    // but simple IN ($var) is usually best for Postgres in Grafana.
    // Actually, let's use the most robust version:
    const projectFilter = "($project = 'all' OR p.id::text IN ($project))";
    const teamFilter = "($team = 'all' OR tp.\"teamId\"::text IN ($team))";
    const memberFilter = "($member = 'all' OR tm.\"personId\"::text IN ($member))";

    // Helper to generate dynamic grouping SQL for metrics that HAVE author-level data
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
  -- Critical: Link the authorship to the membership context
  AND (pam."personId" = tm."personId" OR (pam."personId" IS NULL AND pam."gitEmail" IN (SELECT email FROM "Person" WHERE id = tm."personId")))
GROUP BY 1, 2
ORDER BY 1, 2
`.trim();
    };

    // Helper for metrics that are naturally project-level (LOC, Coverage)
    const getDynamicProjectStateSql = (metricField, agg = 'MAX', title) => {
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
    };

    dashboard.panels.forEach(panel => {
      console.log(`Processing panel: ${panel.title}`);
      if (panel.title === "Commit Count over Time (Contextual)") {
        panel.targets[0].rawSql = getDynamicAuthorSql('pam."commitCount"', panel.title);
      } else if (panel.title === "Code Churn over Time") {
        panel.targets[0].rawSql = getDynamicAuthorSql('pam.additions + pam.deletions', panel.title);
      } else if (panel.title === "Lines of Code over Time (Contextual)") {
        panel.targets[0].rawSql = getDynamicProjectStateSql('linesOfCode', 'MAX', panel.title);
      } else if (panel.title === "Method Coverage (Defined Unit Tests)") {
        panel.targets[0].rawSql = getDynamicProjectStateSql('coverage', 'AVG', panel.title);
      } else if (panel.title === "Developer Activity (Contextual)") {
        // Keep this one simple but fix filters
        panel.targets[0].rawSql = `
SELECT 
  $__timeGroupAlias(pam.timestamp,$__interval),
  COALESCE(per.name, pam."gitEmail") as metric,
  SUM(pam.additions) as value 
FROM "ProjectAuthorMetric" pam
JOIN "Project" p ON pam."projectId" = p.id
JOIN "TeamProject" tp ON tp."projectId" = p.id
JOIN "TeamMembership" tm ON tm."teamId" = tp."teamId"
LEFT JOIN "Person" per ON pam."personId" = per.id
WHERE 
  $__timeFilter(pam.timestamp)
  AND ${projectFilter}
  AND ${teamFilter}
  AND ${memberFilter}
  AND (pam."personId" = tm."personId" OR (pam."personId" IS NULL AND pam."gitEmail" IN (SELECT email FROM "Person" WHERE id = tm."personId")))
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
