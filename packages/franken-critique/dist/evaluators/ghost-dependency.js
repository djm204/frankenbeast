const IMPORT_PATTERN = /(?:import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\))/g;
export class GhostDependencyEvaluator {
    name = 'ghost-dependency';
    category = 'deterministic';
    knownPackages;
    constructor(knownPackages) {
        this.knownPackages = new Set(knownPackages);
    }
    async evaluate(input) {
        const findings = [];
        const seen = new Set();
        for (const match of input.content.matchAll(IMPORT_PATTERN)) {
            const specifier = match[1] ?? match[2];
            if (!specifier)
                continue;
            // Skip relative imports
            if (specifier.startsWith('.'))
                continue;
            // Skip node: built-ins
            if (specifier.startsWith('node:'))
                continue;
            // Extract package name (handle scoped packages and subpath imports)
            const packageName = specifier.startsWith('@')
                ? specifier.split('/').slice(0, 2).join('/')
                : specifier.split('/')[0];
            if (seen.has(packageName))
                continue;
            seen.add(packageName);
            if (!this.knownPackages.has(packageName)) {
                findings.push({
                    message: `Ghost dependency detected: "${packageName}" is not in the known package registry`,
                    severity: 'critical',
                    suggestion: `Add "${packageName}" to dependencies or remove the import`,
                });
            }
        }
        const score = findings.length === 0 ? 1 : 0;
        return {
            evaluatorName: this.name,
            verdict: findings.length === 0 ? 'pass' : 'fail',
            score,
            findings,
        };
    }
}
//# sourceMappingURL=ghost-dependency.js.map