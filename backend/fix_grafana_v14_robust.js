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

        // STRATEGY v14: The "Nuclear" Robust Method
        // 1. Force Dashboard Time to 24h (User data is ~12h old)
        // 2. Variables return RAW values (no quotes).
        // 3. SQL uses Postgres Array logic: 
        //    id::text = ANY(string_to_array('${var:csv}', ','))
        //    This works for single 'id' and multi 'id1,id2' safely.

        dashboard.time = { from: 'now-24h', to: 'now' };

        // 1. Update Variables to Raw

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
            "definition": "SELECT id as value, name as text FROM \"Team\" ORDER BY name",
            "includeAll": true,
            "allValue": null,
            "label": "Team",
            "multi": true,
            "name": "team",
            "query": "SELECT id as value, name as text FROM \"Team\" ORDER BY name",
            "refresh": 1,
            "type": "query",
            "sort": 1
        };

        // Linked Filter: Projects in selected Teams
        // Use Array Logic: WHERE tp."teamId"::text = ANY(string_to_array('${team:csv}', ','))
        const projectVar = {
            "definition": "SELECT DISTINCT p.id as value, p.name as text FROM \"Project\" p JOIN \"TeamProject\" tp ON p.id = tp.\"projectId\" WHERE tp.\"teamId\"::text = ANY(string_to_array('$team', ',')) AND p.\"isSelected\" = true ORDER BY p.name",
            "includeAll": true,
            "allValue": null,
            "label": "Project",
            "multi": true,
            "name": "project",
            // Use ${team:csv} to guarantee CSV format for the array function
            "query": "SELECT DISTINCT p.id as value, p.name as text FROM \"Project\" p JOIN \"TeamProject\" tp ON p.id = tp.\"projectId\" WHERE tp.\"teamId\"::text = ANY(string_to_array('\${team:csv}', ',')) AND p.\"isSelected\" = true ORDER BY p.name",
            "refresh": 1,
            "type": "query",
            "sort": 1
        };

        const memberVar = {
            "definition": "SELECT DISTINCT pers.id as value, pers.name as text FROM \"Person\" pers JOIN \"TeamMembership\" tm ON pers.id = tm.\"personId\" WHERE tm.\"teamId\"::text = ANY(string_to_array('$team', ',')) ORDER BY pers.name",
            "includeAll": true,
            "allValue": null,
            "label": "Member",
            "multi": true,
            "name": "member",
            "query": "SELECT DISTINCT pers.id as value, pers.name as text FROM \"Person\" pers JOIN \"TeamMembership\" tm ON pers.id = tm.\"personId\" WHERE tm.\"teamId\"::text = ANY(string_to_array('\${team:csv}', ',')) ORDER BY pers.name",
            "refresh": 1,
            "type": "query",
            "sort": 1
        };

        dashboard.templating.list = [viewByVar, teamVar, projectVar, memberVar];

        // 2. Update Panels with Array Logic

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

LEFT JOIN "TeamProject" tp ON tp."projectId" = p.id AND '$view_by' = 'team' AND tp."teamId"::text = ANY(string_to_array('\${team:csv}', ','))
LEFT JOIN "Team" t ON t.id = tp."teamId"

WHERE 
  $__timeFilter(pam.timestamp)
  AND p.id::text = ANY(string_to_array('\${project:csv}', ','))
  AND (
    pam."personId"::text = ANY(string_to_array('\${member:csv}', ','))
    OR 
    (pam."personId" IS NULL AND pam."gitEmail" IN (SELECT email FROM "Person" WHERE id::text = ANY(string_to_array('\${member:csv}', ','))))
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
  
  LEFT JOIN "TeamProject" tp ON tp."projectId" = p.id AND '$view_by' = 'team' AND tp."teamId"::text = ANY(string_to_array('\${team:csv}', ','))
  LEFT JOIN "Team" t ON t.id = tp."teamId"

  WHERE 
    $__timeFilter(m.timestamp)
    AND p.id::text = ANY(string_to_array('\${project:csv}', ','))
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
    AND p.id::text = ANY(string_to_array('\${project:csv}', ','))
    AND (
        pam."personId"::text = ANY(string_to_array('\${member:csv}', ','))
        OR 
        (pam."personId" IS NULL AND pam."gitEmail" IN (SELECT email FROM "Person" WHERE id::text = ANY(string_to_array('\${member:csv}', ','))))
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

LEFT JOIN "TeamProject" tp ON tp."projectId" = p.id AND '$view_by' = 'team' AND tp."teamId"::text = ANY(string_to_array('\${team:csv}', ','))
LEFT JOIN "Team" t ON t.id = tp."teamId"

WHERE 
  $__timeFilter(m.timestamp)
  AND p.id::text = ANY(string_to_array('\${project:csv}', ','))
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

        console.log('Dashboard SQL fixed successfully (v14 - Robust Array Logic):', updateResponse.data.status);
    } catch (error) {
        console.error('Error fixing dashboard SQL:', error.response?.data || error.message);
    }
}

fixQueries();
