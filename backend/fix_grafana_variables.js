const axios = require('axios');

const GRAFANA_URL = 'http://localhost:3000';
const AUTH = 'Basic ' + Buffer.from('admin:admin').toString('base64');
const DASHBOARD_UID = 'project-metrics';

async function fixVariables() {
    try {
        console.log('Fetching dashboard...');
        const response = await axios.get(`${GRAFANA_URL}/api/dashboards/uid/${DASHBOARD_UID}`, {
            headers: { 'Authorization': AUTH }
        });

        const dashboard = response.data.dashboard;

        // 1. Define Variables
        const viewByVar = {
            "current": { "selected": true, "text": "Project", "value": "project" },
            "hide": 0,
            "includeAll": false,
            "label": "Group By",
            "multi": false,
            "name": "view_by",
            "options": [
                { "selected": true, "text": "Project", "value": "project" },
                { "selected": false, "text": "Team", "value": "team" },
                { "selected": false, "text": "Member", "value": "member" }
            ],
            "query": "project,team,member",
            "queryValue": "",
            "skipUrlSync": false,
            "type": "custom"
        };

        const teamVar = {
            "current": { "selected": false, "text": "All", "value": "$__all" },
            "definition": "SELECT id as value, name as text FROM \"Team\" ORDER BY name",
            "hide": 0,
            "includeAll": true,
            "allValue": null, // Default to sending all values
            "label": "Team",
            "multi": true,
            "name": "team",
            "options": [],
            "query": "SELECT id as value, name as text FROM \"Team\" ORDER BY name",
            "refresh": 1, // On Dashboard Load
            "regex": "",
            "skipUrlSync": false,
            "sort": 1,
            "type": "query"
        };

        // Linked Filter: Projects in selected Teams
        const projectVar = {
            "current": { "selected": false, "text": "All", "value": "$__all" },
            "definition": "SELECT p.id as value, p.name as text FROM \"Project\" p JOIN \"TeamProject\" tp ON p.id = tp.\"projectId\" WHERE tp.\"teamId\" IN ($team) AND p.\"isSelected\" = true ORDER BY p.name",
            "hide": 0,
            "includeAll": true,
            "allValue": null,
            "label": "Project",
            "multi": true,
            "name": "project",
            "options": [],
            "query": "SELECT DISTINCT p.id as value, p.name as text FROM \"Project\" p JOIN \"TeamProject\" tp ON p.id = tp.\"projectId\" WHERE tp.\"teamId\" IN ($team) AND p.\"isSelected\" = true ORDER BY p.name",
            "refresh": 1, // On Dashboard Load
            "regex": "",
            "skipUrlSync": false,
            "sort": 1, // Alphabetical
            "type": "query"
        };

        // Linked Filter: Members in selected Teams
        const memberVar = {
            "current": { "selected": false, "text": "All", "value": "$__all" },
            "definition": "SELECT DISTINCT pers.id as value, pers.name as text FROM \"Person\" pers JOIN \"TeamMembership\" tm ON pers.id = tm.\"personId\" WHERE tm.\"teamId\" IN ($team) ORDER BY pers.name",
            "hide": 0,
            "includeAll": true,
            "allValue": null,
            "label": "Member",
            "multi": true,
            "name": "member",
            "options": [],
            "query": "SELECT DISTINCT pers.id as value, pers.name as text FROM \"Person\" pers JOIN \"TeamMembership\" tm ON pers.id = tm.\"personId\" WHERE tm.\"teamId\" IN ($team) ORDER BY pers.name",
            "refresh": 1, // On Dashboard Load
            "regex": "",
            "skipUrlSync": false,
            "sort": 1,
            "type": "query"
        };

        // Reconstruct variables list ensuring order: view_by -> team -> project -> member
        dashboard.templating.list = [viewByVar, teamVar, projectVar, memberVar];

        console.log('Sending update to Grafana...');
        const updateResponse = await axios.post(`${GRAFANA_URL}/api/dashboards/db`, {
            dashboard: dashboard,
            overwrite: true
        }, {
            headers: { 'Authorization': AUTH }
        });

        console.log('Dashboard variables fixed successfully:', updateResponse.data.status);

    } catch (error) {
        console.error('Error fixing variables:', error.response?.data || error.message);
    }
}

fixVariables();
