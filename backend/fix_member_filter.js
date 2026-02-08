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

        // SQL for commit count - switches between project-level and author-level metrics
        const commitCountSql = `
-- Query that switches between project-level and author-level metrics based on filter
WITH 
  selected_members AS (
    SELECT UNNEST(string_to_array($member::text, ','))::text AS member_id
  ),
  is_member_filter AS (
    SELECT COUNT(*) > 0 AND NOT ('all' = ANY(string_to_array($member::text, ','))) AS has_member_filter
    FROM selected_members
  )
SELECT
  m.timestamp as time,
  p.name AS metric,
  m."commitCount" AS value
FROM "ProjectMetric" m
JOIN "Project" p ON m."projectId" = p.id
WHERE 
  $__timeFilter(m.timestamp)
  AND (p.id::text = ANY(string_to_array($project::text, ',')) OR 'all' = ANY(string_to_array($project::text, ',')))
  AND EXISTS (
      SELECT 1 FROM "TeamProject" tp
      JOIN "TeamMembership" tm ON tp."teamId" = tm."teamId"
      WHERE tp."projectId" = p.id
      AND (tp."teamId"::text = ANY(string_to_array($team::text, ',')) OR 'all' = ANY(string_to_array($team::text, ',')))
      AND (tm."personId"::text = ANY(string_to_array($member::text, ',')) OR 'all' = ANY(string_to_array($member::text, ',')))
  )
  AND NOT (SELECT has_member_filter FROM is_member_filter)

UNION ALL

-- Author-level metrics when member filter is active
SELECT
  pam.timestamp as time,
  p.name AS metric,
  pam."commitCount" AS value
FROM "ProjectAuthorMetric" pam
JOIN "Project" p ON pam."projectId" = p.id
LEFT JOIN "Person" per ON pam."personId" = per.id
WHERE 
  $__timeFilter(pam.timestamp)
  AND (p.id::text = ANY(string_to_array($project::text, ',')) OR 'all' = ANY(string_to_array($project::text, ',')))
  AND EXISTS (
      SELECT 1 FROM "TeamProject" tp
      JOIN "TeamMembership" tm ON tp."teamId" = tm."teamId"
      WHERE tp."projectId" = p.id
      AND (tp."teamId"::text = ANY(string_to_array($team::text, ',')) OR 'all' = ANY(string_to_array($team::text, ',')))
  )
  AND (pam."personId"::text = ANY(string_to_array($member::text, ',')) OR pam."gitEmail" IN (SELECT email FROM "Person" WHERE id::text = ANY(string_to_array($member::text, ','))))
  AND (SELECT has_member_filter FROM is_member_filter)

ORDER BY time
`.trim();

        // SQL for code churn (additions + deletions)
        const churnSql = `
WITH 
  selected_members AS (
    SELECT UNNEST(string_to_array($member::text, ','))::text AS member_id
  ),
  is_member_filter AS (
    SELECT COUNT(*) > 0 AND NOT ('all' = ANY(string_to_array($member::text, ','))) AS has_member_filter
    FROM selected_members
  )
SELECT
  $__timeGroupAlias(m.timestamp,$__interval),
  p.name AS metric,
  SUM(m.churn) AS value
FROM "ProjectMetric" m
JOIN "Project" p ON m."projectId" = p.id
WHERE 
  $__timeFilter(m.timestamp)
  AND (p.id::text = ANY(string_to_array($project::text, ',')) OR 'all' = ANY(string_to_array($project::text, ',')))
  AND EXISTS (
      SELECT 1 FROM "TeamProject" tp
      JOIN "TeamMembership" tm ON tp."teamId" = tm."teamId"
      WHERE tp."projectId" = p.id
      AND (tp."teamId"::text = ANY(string_to_array($team::text, ',')) OR 'all' = ANY(string_to_array($team::text, ',')))
      AND (tm."personId"::text = ANY(string_to_array($member::text, ',')) OR 'all' = ANY(string_to_array($member::text, ',')))
  )
  AND NOT (SELECT has_member_filter FROM is_member_filter)
GROUP BY 1, 2

UNION ALL

SELECT
  $__timeGroupAlias(pam.timestamp,$__interval),
  p.name AS metric,
  SUM(pam.additions + pam.deletions) AS value
FROM "ProjectAuthorMetric" pam
JOIN "Project" p ON pam."projectId" = p.id
WHERE 
  $__timeFilter(pam.timestamp)
  AND (p.id::text = ANY(string_to_array($project::text, ',')) OR 'all' = ANY(string_to_array($project::text, ',')))
  AND EXISTS (
      SELECT 1 FROM "TeamProject" tp
      WHERE tp."projectId" = p.id
      AND (tp."teamId"::text = ANY(string_to_array($team::text, ',')) OR 'all' = ANY(string_to_array($team::text, ',')))
  )
  AND (pam."personId"::text = ANY(string_to_array($member::text, ',')) OR pam."gitEmail" IN (SELECT email FROM "Person" WHERE id::text = ANY(string_to_array($member::text, ','))))
  AND (SELECT has_member_filter FROM is_member_filter)
GROUP BY 1, 2

ORDER BY 1, 2
`.trim();

        // Update panels
        dashboard.panels.forEach(panel => {
            if (panel.title === "Commit Count over Time (Contextual)") {
                panel.targets[0].rawSql = commitCountSql;
                console.log('Updated: Commit Count over Time (Contextual)');
            } else if (panel.title === "Code Churn over Time") {
                panel.targets[0].rawSql = churnSql;
                console.log('Updated: Code Churn over Time');
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
