const fs = require('fs');

const raw = fs.readFileSync('dashboard.json', 'utf8');
const data = JSON.parse(raw);
const dashboard = data.dashboard;

const fixSql = (sql) => {
    // Replace p.name IN ($project) with (p.id IN ($project) OR 'all' IN ($project))
    // Replace tp."teamId" IN ($team) with (tp."teamId" IN ($team) OR 'all' IN ($team))
    // Replace tm."personId" IN ($member) with (tm."personId" IN ($member) OR 'all' IN ($member))
    // Handle p.id IN ($project) as well

    let newSql = sql.replace(/p\.(name|id) IN \(\$project\)/g, '(p.id IN ($project) OR \'all\' IN ($project))');
    newSql = newSql.replace(/tp\."teamId" IN \(\$team\)/g, '(tp."teamId" IN ($team) OR \'all\' IN ($team))');
    newSql = newSql.replace(/tm\."personId" IN \(\$member\)/g, '(tm."personId" IN ($member) OR \'all\' IN ($member))');

    return newSql;
};

dashboard.panels.forEach(p => {
    if (p.targets && p.targets[0] && p.targets[0].rawSql) {
        console.log(`Fixing SQL for panel: ${p.title}`);
        p.targets[0].rawSql = fixSql(p.targets[0].rawSql);
    }
});

const output = {
    dashboard: dashboard,
    overwrite: true,
    message: "Fixed SQL for 'all' filter support in Churn and Coverage panels"
};

fs.writeFileSync('dashboard_sql_fix.json', JSON.stringify(output, null, 2));
console.log('Modified dashboard JSON written to dashboard_sql_fix.json');
