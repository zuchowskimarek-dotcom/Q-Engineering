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

        // Robust Filter Clauses (No "OR = 'all'" to avoid syntax errors)
        // We use IN ($var) because 'All' sends all IDs.

        // Filter Projects that belong to the selected Teams
        // We use a subquery to avoid joining TeamProject in the main query (prevents duplication)
        const teamFilterSubquery = `p.id IN (SELECT "projectId" FROM "TeamProject" WHERE "teamId" IN ($team))`;

        // Standard ID filters
        // If $project is 'All', it contains all IDs -> valid
        const projectFilter = `p.id IN ($project)`;

        // Member Filter 
        // Handles NULL personId (unlinked git email) by checking email
        const getMemberFilter = (tableAlias) => `
          (
            ${tableAlias}."personId" IN ($member)
            OR 
            (${tableAlias}."personId" IS NULL AND ${tableAlias}."gitEmail" IN (SELECT email FROM "Person" WHERE id IN ($member)))
          )
        `;

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

-- JOIN Team info ONLY if we are viewing by TEAM.
-- This prevents row duplication (double counting) when viewing by Project/Member.
LEFT JOIN "TeamProject" tp ON tp."projectId" = p.id AND '$view_by' = 'team'
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
  
  -- Conditional Join for Team View
  LEFT JOIN "TeamProject" tp ON tp."projectId" = p.id AND '$view_by' = 'team'
  LEFT JOIN "Team" t ON t.id = tp."teamId"

  WHERE 
    $__timeFilter(m.timestamp)
    AND ${teamFilterSubquery}
    AND ${projectFilter}
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

-- Coverage uses Person info? The previous query joined Person/TeamMembership.
-- Metrics are per project, not per person. But filtering by Member...
-- If filtering by member, we need to know if the project HAS that member?
-- Or is checking coverage of projects related to that member?

-- Original query joined TeamMembership tm + Person per.
-- It seems Coverage chart grouped by Member shows average coverage of projects linked to member? A bit weird metrically, but let's preserve logic.

-- Conditional Join Logic:
LEFT JOIN "TeamProject" tp ON tp."projectId" = p.id AND ('$view_by' = 'team' OR '$view_by' = 'member')
LEFT JOIN "Team" t ON t.id = tp."teamId"
LEFT JOIN "TeamMembership" tm ON tm."teamId" = t.id AND '$view_by' = 'member'
LEFT JOIN "Person" per ON per.id = tm."personId"

WHERE 
  $__timeFilter(m.timestamp)
  AND ${teamFilterSubquery}
  AND ${projectFilter}
  -- For coverage, member filtering is tricky if metric is project-level.
  -- Assuming we filter projects where the member is part of the owner team?
  -- Using Member Filter on TeamMembership (for consistency with old query)
  AND (
     '$member' = 'all' -- We assume 'all' handling logic check or just use IN
     OR tm."personId" IN ($member)
  )

GROUP BY 1, 2
ORDER BY 1, 2
`.trim();
                // Simplified Coverage logic: Assuming Member view groups by Person who is in the team dealing with project.
                // Re-implementing strictly minimal fix for Coverage to avoid breaking it, focusing on Syntax.
                // Since Coverage is Project-level, breaking it down by Member implies "Average coverage of projects this member has access to".

                // Let's stick to the conditional JOIN pattern for consistency.

                panel.targets[0].rawSql = `
SELECT
  $__timeGroupAlias(m.timestamp,$__interval),
  CASE 
    WHEN '$view_by' = 'team' THEN t.name
    -- Coverage doesn't really map to 'member' well (it's project metric), but if enabled:
    ELSE p.name 
  END AS metric,
  AVG(m."coverage") AS value
FROM "ProjectMetric" m
JOIN "Project" p ON m."projectId" = p.id

LEFT JOIN "TeamProject" tp ON tp."projectId" = p.id AND '$view_by' = 'team'
LEFT JOIN "Team" t ON t.id = tp."teamId"

WHERE 
  $__timeFilter(m.timestamp)
  AND ${teamFilterSubquery}
  AND p.id IN ($project)
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

        console.log('Dashboard SQL fixed successfully (v9 - Optimized Joins):', updateResponse.data.status);
    } catch (error) {
        console.error('Error fixing dashboard SQL:', error.response?.data || error.message);
    }
}

fixQueries();
