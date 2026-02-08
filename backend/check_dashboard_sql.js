const axios = require('axios');

const GRAFANA_URL = 'http://localhost:3000';
const AUTH = 'Basic ' + Buffer.from('admin:admin').toString('base64');
const DASHBOARD_UID = 'project-metrics';

async function checkDashboard() {
    try {
        console.log('Fetching dashboard...');
        const response = await axios.get(`${GRAFANA_URL}/api/dashboards/uid/${DASHBOARD_UID}`, {
            headers: { 'Authorization': AUTH }
        });

        const dashboard = response.data.dashboard;
        let hasGroupByLogic = false;

        dashboard.panels.forEach(panel => {
            if (panel.targets && panel.targets.length > 0) {
                const sql = panel.targets[0].rawSql || '';
                if (sql.includes("$view_by")) {
                    console.log(`[OK] Panel '${panel.title}' contains $view_by logic.`);
                    hasGroupByLogic = true;
                } else {
                    console.log(`[FAIL] Panel '${panel.title}' DOES NOT contain $view_by logic.`);
                    console.log(`       SQL: ${sql.substring(0, 100)}...`);
                }
            }
        });

        if (!hasGroupByLogic) {
            console.log('\nCONCLUSION: The dashboard is missing dynamic Group By logic. It was likely overwritten by a script that hardcodes project grouping.');
        } else {
            console.log('\nCONCLUSION: The dashboard HAS Group By logic. The issue might be in how the variable is passed or evaluated.');
        }

    } catch (error) {
        console.error('Error fetching dashboard:', error.message);
    }
}

checkDashboard();
