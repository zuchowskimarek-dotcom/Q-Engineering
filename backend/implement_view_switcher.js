const axios = require('axios');

const GRAFANA_URL = 'http://localhost:3000';
const AUTH = 'Basic ' + Buffer.from('admin:admin').toString('base64');
const DASHBOARD_UID = 'project-metrics';

async function implementViewSwitcher() {
    try {
        // 1. Fetch the dashboard
        const response = await axios.get(`${GRAFANA_URL}/api/dashboards/uid/${DASHBOARD_UID}`, {
            headers: { 'Authorization': AUTH }
        });

        const dashboard = response.data.dashboard;

        // 2. Add "View By" variable if it doesn't exist
        if (!dashboard.templating) {
            dashboard.templating = { list: [] };
        }

        const existingViewVar = dashboard.templating.list.find(v => v.name === 'view_by');
        if (!existingViewVar) {
            dashboard.templating.list.push({
                "name": "view_by",
                "type": "custom",
                "label": "Group By",
                "current": {
                    "selected": true,
                    "text": "Project",
                    "value": "project"
                },
                "options": [
                    {
                        "selected": true,
                        "text": "Project",
                        "value": "project"
                    },
                    {
                        "selected": false,
                        "text": "Team",
                        "value": "team"
                    },
                    {
                        "selected": false,
                        "text": "Member",
                        "value": "member"
                    }
                ],
                "query": "Project : project, Team : team, Member : member",
                "hide": 0
            });
            console.log('Added "Group By" variable');
        }

        // 3. Create the smart SQL query for commit count
        const commitCountSql = `
-- Dynamic query that groups by Project, Team, or Member based on $view_by variable
WITH view_config AS (
  SELECT 
    CASE 
      WHEN '$view_by' = 'project' THEN 'project'
      WHEN '$view_by' = 'team' THEN 'team'
      WHEN '$view_by' = 'member' THEN 'member'
      ELSE 'project'
    END as view_mode
)

-- PER PROJECT VIEW
SELECT
  pam.timestamp as time,
  p.name AS metric,
  SUM(pam."commitCount") AS value
FROM "ProjectAuthorMetric" pam
JOIN "Project" p ON pam."projectId" = p.id
JOIN "TeamProject" tp ON tp."projectId" = p.id
JOIN "TeamMembership" tm ON tm."teamId" = tp."teamId"
WHERE 
  $__timeFilter(pam.timestamp)
  AND (p.id::text = ANY(string_to_array($project::text, ',')) OR 'all' = ANY(string_to_array($project::text, ',')))
  AND (tp."teamId"::text = ANY(string_to_array($team::text, ',')) OR 'all' = ANY(string_to_array($team::text, ',')))
  AND (tm."personId"::text = ANY(string_to_array($member::text, ',')) OR 'all' = ANY(string_to_array($member::text, ',')))
  AND (pam."personId" = tm."personId" OR pam."gitEmail" IN (SELECT email FROM "Person" WHERE id = tm."personId"))
  AND (SELECT view_mode FROM view_config) = 'project'
GROUP BY pam.timestamp, p.name

UNION ALL

-- PER TEAM VIEW
SELECT
  pam.timestamp as time,
  t.name AS metric,
  SUM(pam."commitCount") AS value
FROM "ProjectAuthorMetric" pam
JOIN "Project" p ON pam."projectId" = p.id
JOIN "TeamProject" tp ON tp."projectId" = p.id
JOIN "Team" t ON t.id = tp."teamId"
JOIN "TeamMembership" tm ON tm."teamId" = t.id
WHERE 
  $__timeFilter(pam.timestamp)
  AND (p.id::text = ANY(string_to_array($project::text, ',')) OR 'all' = ANY(string_to_array($project::text, ',')))
  AND (tp."teamId"::text = ANY(string_to_array($team::text, ',')) OR 'all' = ANY(string_to_array($team::text, ',')))
  AND (tm."personId"::text = ANY(string_to_array($member::text, ',')) OR 'all' = ANY(string_to_array($member::text, ',')))
  AND (pam."personId" = tm."personId" OR pam."gitEmail" IN (SELECT email FROM "Person" WHERE id = tm."personId"))
  AND (SELECT view_mode FROM view_config) = 'team'
GROUP BY pam.timestamp, t.name

UNION ALL

-- PER MEMBER VIEW
SELECT
  pam.timestamp as time,
  COALESCE(per.name, pam."gitEmail") AS metric,
  SUM(pam."commitCount") AS value
FROM "ProjectAuthorMetric" pam
JOIN "Project" p ON pam."projectId" = p.id
JOIN "TeamProject" tp ON tp."projectId" = p.id
JOIN "TeamMembership" tm ON tm."teamId" = tp."teamId"
LEFT JOIN "Person" per ON per.id = pam."personId"
WHERE 
  $__timeFilter(pam.timestamp)
  AND (p.id::text = ANY(string_to_array($project::text, ',')) OR 'all' = ANY(string_to_array($project::text, ',')))
  AND (tp."teamId"::text = ANY(string_to_array($team::text, ',')) OR 'all' = ANY(string_to_array($team::text, ',')))
  AND (tm."personId"::text = ANY(string_to_array($member::text, ',')) OR 'all' = ANY(string_to_array($member::text, ',')))
  AND (pam."personId" = tm."personId" OR pam."gitEmail" IN (SELECT email FROM "Person" WHERE id = tm."personId"))
  AND (SELECT view_mode FROM view_config) = 'member'
GROUP BY pam.timestamp, per.name, pam."gitEmail"

ORDER BY time, metric
`.trim();

        // 4. Create the smart SQL query for code churn
        const churnSql = `
-- Dynamic query that groups by Project, Team, or Member based on $view_by variable
WITH view_config AS (
  SELECT 
    CASE 
      WHEN '$view_by' = 'project' THEN 'project'
      WHEN '$view_by' = 'team' THEN 'team'
      WHEN '$view_by' = 'member' THEN 'member'
      ELSE 'project'
    END as view_mode
)

-- PER PROJECT VIEW
SELECT
  $__timeGroupAlias(pam.timestamp,$__interval),
  p.name AS metric,
  SUM(pam.additions + pam.deletions) AS value
FROM "ProjectAuthorMetric" pam
JOIN "Project" p ON pam."projectId" = p.id
JOIN "TeamProject" tp ON tp."projectId" = p.id
JOIN "TeamMembership" tm ON tm."teamId" = tp."teamId"
WHERE 
  $__timeFilter(pam.timestamp)
  AND (p.id::text = ANY(string_to_array($project::text, ',')) OR 'all' = ANY(string_to_array($project::text, ',')))
  AND (tp."teamId"::text = ANY(string_to_array($team::text, ',')) OR 'all' = ANY(string_to_array($team::text, ',')))
  AND (tm."personId"::text = ANY(string_to_array($member::text, ',')) OR 'all' = ANY(string_to_array($member::text, ',')))
  AND (pam."personId" = tm."personId" OR pam."gitEmail" IN (SELECT email FROM "Person" WHERE id = tm."personId"))
  AND (SELECT view_mode FROM view_config) = 'project'
GROUP BY 1, p.name

UNION ALL

-- PER TEAM VIEW
SELECT
  $__timeGroupAlias(pam.timestamp,$__interval),
  t.name AS metric,
  SUM(pam.additions + pam.deletions) AS value
FROM "ProjectAuthorMetric" pam
JOIN "Project" p ON pam."projectId" = p.id
JOIN "TeamProject" tp ON tp."projectId" = p.id
JOIN "Team" t ON t.id = tp."teamId"
JOIN "TeamMembership" tm ON tm."teamId" = t.id
WHERE 
  $__timeFilter(pam.timestamp)
  AND (p.id::text = ANY(string_to_array($project::text, ',')) OR 'all' = ANY(string_to_array($project::text, ',')))
  AND (tp."teamId"::text = ANY(string_to_array($team::text, ',')) OR 'all' = ANY(string_to_array($team::text, ',')))
  AND (tm."personId"::text = ANY(string_to_array($member::text, ',')) OR 'all' = ANY(string_to_array($member::text, ',')))
  AND (pam."personId" = tm."personId" OR pam."gitEmail" IN (SELECT email FROM "Person" WHERE id = tm."personId"))
  AND (SELECT view_mode FROM view_config) = 'team'
GROUP BY 1, t.name

UNION ALL

-- PER MEMBER VIEW
SELECT
  $__timeGroupAlias(pam.timestamp,$__interval),
  COALESCE(per.name, pam."gitEmail") AS metric,
  SUM(pam.additions + pam.deletions) AS value
FROM "ProjectAuthorMetric" pam
JOIN "Project" p ON pam."projectId" = p.id
JOIN "TeamProject" tp ON tp."projectId" = p.id
JOIN "TeamMembership" tm ON tm."teamId" = tp."teamId"
LEFT JOIN "Person" per ON per.id = pam."personId"
WHERE 
  $__timeFilter(pam.timestamp)
  AND (p.id::text = ANY(string_to_array($project::text, ',')) OR 'all' = ANY(string_to_array($project::text, ',')))
  AND (tp."teamId"::text = ANY(string_to_array($team::text, ',')) OR 'all' = ANY(string_to_array($team::text, ',')))
  AND (tm."personId"::text = ANY(string_to_array($member::text, ',')) OR 'all' = ANY(string_to_array($member::text, ',')))
  AND (pam."personId" = tm."personId" OR pam."gitEmail" IN (SELECT email FROM "Person" WHERE id = tm."personId"))
  AND (SELECT view_mode FROM view_config) = 'member'
GROUP BY 1, per.name, pam."gitEmail"

ORDER BY 1, 2
`.trim();

        // 5. Update the panels
        dashboard.panels.forEach(panel => {
            if (panel.title === "Commit Count over Time (Contextual)") {
                panel.targets[0].rawSql = commitCountSql;
                console.log('✓ Updated: Commit Count over Time (Contextual)');
            } else if (panel.title === "Code Churn over Time") {
                panel.targets[0].rawSql = churnSql;
                console.log('✓ Updated: Code Churn over Time');
            }
        });

        // 6. Save the dashboard
        const updateResponse = await axios.post(`${GRAFANA_URL}/api/dashboards/db`, {
            dashboard: dashboard,
            overwrite: true
        }, {
            headers: { 'Authorization': AUTH }
        });

        console.log('\n✅ Dashboard updated successfully:', updateResponse.data.status);
        console.log('\n📊 New "Group By" variable added with options:');
        console.log('   - Project (default)');
        console.log('   - Team');
        console.log('   - Member');
        console.log('\n💡 Now you can switch visualization modes while keeping all filters active!');
    } catch (error) {
        console.error('❌ Error:', error.response?.data || error.message);
    }
}

implementViewSwitcher();
