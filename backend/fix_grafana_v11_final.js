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

        // STRATEGY v11: Pre-Quote Values
        // We modify the Variable Definitions to return values encapsulated in single quotes.
        // This makes $team safely expand to 'id1','id2' without Grafana macros.

        // 1. Update Variables

        const viewByVar = {
            "current": { "selected": true, "text": "Project", "value": "project" },
            "hide": 0,
            "label": "Group By",
            "name": "view_by",
            "options": [
                { "selected": true, "text": "Project", "value": "project" },
                { "selected": false, "text": "Team", "value": "team" },
                { "selected": false, "text": "Member", "value": "member" }
            ],
            "query": "project,team,member",
            "type": "custom"
        };

        const teamVar = {
            // Use format() to wrap ID in single quotes
            "definition": "SELECT format('''%s''', id) as value, name as text FROM \"Team\" ORDER BY name",
            "includeAll": true,
            "allValue": null, // Send all quoted IDs
            "label": "Team",
            "multi": true,
            "name": "team",
            "query": "SELECT format('''%s''', id) as value, name as text FROM \"Team\" ORDER BY name",
            "refresh": 1,
            "type": "query",
            "sort": 1
        };

        const projectVar = {
            // Filter by $team (which is now quoted list)
            // Return quoted Project IDs
            "definition": "SELECT DISTINCT format('''%s''', p.id) as value, p.name as text FROM \"Project\" p JOIN \"TeamProject\" tp ON p.id = tp.\"projectId\" WHERE tp.\"teamId\" IN ($team) AND p.\"isSelected\" = true ORDER BY p.name",
            "includeAll": true,
            "allValue": null,
            "label": "Project",
            "multi": true,
            "name": "project",
            "query": "SELECT DISTINCT format('''%s''', p.id) as value, p.name as text FROM \"Project\" p JOIN \"TeamProject\" tp ON p.id = tp.\"projectId\" WHERE tp.\"teamId\" IN ($team) AND p.\"isSelected\" = true ORDER BY p.name",
            "refresh": 1,
            "type": "query",
            "sort": 1
        };

        const memberVar = {
            "definition": "SELECT DISTINCT format('''%s''', pers.id) as value, pers.name as text FROM \"Person\" pers JOIN \"TeamMembership\" tm ON pers.id = tm.\"personId\" WHERE tm.\"teamId\" IN ($team) ORDER BY pers.name",
            "includeAll": true,
            "allValue": null,
            "label": "Member",
            "multi": true,
            "name": "member",
            "query": "SELECT DISTINCT format('''%s''', pers.id) as value, pers.name as text FROM \"Person\" pers JOIN \"TeamMembership\" tm ON pers.id = tm.\"personId\" WHERE tm.\"teamId\" IN ($team) ORDER BY pers.name",
            "refresh": 1,
            "type": "query",
            "sort": 1
        };

        dashboard.templating.list = [viewByVar, teamVar, projectVar, memberVar];

        // 2. Update Panels to use clean syntax (no macros)
        // We also simplified logic: Removed redundant team filter subquery since $project handles it.

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

-- Conditional Join for Team View + Filter to selected teams (anti-duplication)
-- Using $team (pre-quoted)
LEFT JOIN "TeamProject" tp ON tp."projectId" = p.id AND '$view_by' = 'team' AND tp."teamId" IN ($team)
LEFT JOIN "Team" t ON t.id = tp."teamId"

WHERE 
  $__timeFilter(pam.timestamp)
  AND p.id IN ($project) -- $project is pre-quoted
  -- Member filter handles simple IN or special logic for unlinked emails
  AND (
    pam."personId" IN ($member)
    OR 
    (pam."personId" IS NULL AND pam."gitEmail" IN (SELECT email FROM "Person" WHERE id IN ($member)))
  )
  
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
  
  LEFT JOIN "TeamProject" tp ON tp."projectId" = p.id AND '$view_by' = 'team' AND tp."teamId" IN ($team)
  LEFT JOIN "Team" t ON t.id = tp."teamId"

  WHERE 
    $__timeFilter(m.timestamp)
    AND p.id IN ($project)
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
    AND p.id IN ($project)
    AND (
        pam."personId" IN ($member)
        OR 
        (pam."personId" IS NULL AND pam."gitEmail" IN (SELECT email FROM "Person" WHERE id IN ($member)))
    )
    AND '$view_by' = 'member'
  GROUP BY 1, 2
) sub
ORDER BY 1, 2
`.trim();
        };

        const getCoverageSql = () => {
            return `
SELECT
  $__timeGroupAlias(m.timestamp,$__interval),
  CASE 
    WHEN '$view_by' = 'team' THEN t.name
    ELSE p.name 
  END AS metric,
  AVG(m."coverage") AS value
FROM "ProjectMetric" m
JOIN "Project" p ON m."projectId" = p.id

LEFT JOIN "TeamProject" tp ON tp."projectId" = p.id AND '$view_by' = 'team' AND tp."teamId" IN ($team)
LEFT JOIN "Team" t ON t.id = tp."teamId"

WHERE 
  $__timeFilter(m.timestamp)
  AND p.id IN ($project)
GROUP BY 1, 2
ORDER BY 1, 2
`.trim();
        }

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
                panel.targets[0].rawSql = getCoverageSql();
            }
        });

        console.log('Sending update to Grafana...');
        const updateResponse = await axios.post(`${GRAFANA_URL}/api/dashboards/db`, {
            dashboard: dashboard,
            overwrite: true
        }, {
            headers: { 'Authorization': AUTH }
        });

        console.log('Dashboard SQL fixed successfully (v11 - Quoted Values):', updateResponse.data.status);
    } catch (error) {
        console.error('Error fixing dashboard SQL:', error.response?.data || error.message);
    }
}

fixQueries();
