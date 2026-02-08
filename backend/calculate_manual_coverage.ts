
import fs from 'fs';
import path from 'path';

const projectPath = "/Users/marekzuchowski/Library/Mobile Documents/com~apple~CloudDocs/projects/Q-Products/Q-Agile/CodeBase/XQ/per";

function getAllFiles(dir: string, extension: string, fileFilter: (f: string) => boolean): string[] {
    let results: string[] = [];
    if (!fs.existsSync(dir)) return results;

    const list = fs.readdirSync(dir);

    for (const file of list) {
        if (['node_modules', 'bin', 'obj', '.git'].includes(file)) continue;

        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            results = results.concat(getAllFiles(fullPath, extension, fileFilter));
        } else {
            if (file.endsWith(extension) && fileFilter(file)) {
                results.push(fullPath);
            }
        }
    }
    return results;
}

function calculateCoverage() {
    console.log(`Scanning: ${projectPath}`);

    // 1. Find Source Files (exclude Tests)
    const sourceFiles = getAllFiles(projectPath, '.cs', (f) => !f.includes('Test'));
    console.log(`Found ${sourceFiles.length} source files.`);

    // 2. Find Test Files
    const testFiles = getAllFiles(projectPath, '.cs', (f) => f.includes('Test'));
    console.log(`Found ${testFiles.length} test files.`);

    // 3. Load Test Content into Memory (for fast lookup)
    let allTestContent = "";
    testFiles.forEach(f => {
        allTestContent += fs.readFileSync(f, 'utf8') + "\n";
    });

    // 4. Extract Methods and Check Coverage
    let totalMethods = 0;
    let coveredMethods = 0;

    const methodRegex = /public\s+(?:async\s+)?(?:virtual\s+|override\s+|static\s+|sealed\s+)?(?:[\w<>.\[\]?]+\s+)+(\w+)\s*(?:<[^>]+>)?\s*\(/g;
    // Regex explanation:
    // public
    // optional async/virtual/static
    // return type (words, <>, [], ?)
    // MethodName (group 1)
    // optional generic <T>
    // (

    console.log("\n--- Analyzing Methods ---");

    for (const file of sourceFiles) {
        const content = fs.readFileSync(file, 'utf8');
        let match;
        while ((match = methodRegex.exec(content)) !== null) {
            const methodName = match[1];

            // Skip constructors (matches class name, but often same as filename) or trivial standard methods if desired
            // But let's count them for now as per Request.
            // Skip if method name is class name (Constructor) -> simplistic check
            const classNameMatch = /class\s+(\w+)/.exec(content);
            if (classNameMatch && classNameMatch[1] === methodName) continue;

            totalMethods++;

            // Check if present in ANY test file
            // Simple string includes check. 
            // Limitation: Overloads are conflated. Common names like "Execute" might be false positives.
            // But strict enough for "Heuristic".
            if (allTestContent.includes(methodName)) {
                coveredMethods++;
            }
        }
    }

    const percentage = totalMethods > 0 ? ((coveredMethods / totalMethods) * 100).toFixed(2) : "0.00";

    console.log("\n--- Results ---");
    console.log(`Total Public Methods: ${totalMethods}`);
    console.log(`Covered (referenced in tests): ${coveredMethods}`);
    console.log(`Estimated Coverage: ${percentage}%`);
}

calculateCoverage();
