// Matches while(true){...} or for(;;){...} — captures the loop body
const INFINITE_LOOP_PATTERNS = [
    /while\s*\(\s*true\s*\)\s*\{([^}]*)\}/g,
    /for\s*\(\s*;;\s*\)\s*\{([^}]*)\}/g,
];
// Matches function name() { ... name() ... } where the call has no preceding if/return/?
const SELF_RECURSION_PATTERN = /function\s+(\w+)\s*\([^)]*\)\s*\{([\s\S]*?)\}/g;
export class LogicLoopEvaluator {
    name = 'logic-loop';
    category = 'deterministic';
    async evaluate(input) {
        const findings = [];
        this.checkInfiniteLoops(input.content, findings);
        this.checkUnguardedRecursion(input.content, findings);
        const score = findings.length === 0 ? 1 : 0;
        return {
            evaluatorName: this.name,
            verdict: findings.length === 0 ? 'pass' : 'fail',
            score,
            findings,
        };
    }
    checkInfiniteLoops(content, findings) {
        for (const pattern of INFINITE_LOOP_PATTERNS) {
            for (const match of content.matchAll(pattern)) {
                const body = match[1] ?? '';
                if (!body.includes('break') && !body.includes('return')) {
                    findings.push({
                        message: 'Potential infinite loop detected: loop has no break or return statement',
                        severity: 'critical',
                        suggestion: 'Add a break condition or return statement inside the loop',
                    });
                }
            }
        }
    }
    checkUnguardedRecursion(content, findings) {
        for (const match of content.matchAll(SELF_RECURSION_PATTERN)) {
            const fnName = match[1];
            const body = match[2] ?? '';
            if (!fnName)
                continue;
            // Check if the function calls itself
            const callPattern = new RegExp(`\\b${fnName}\\s*\\(`, 'g');
            if (!callPattern.test(body))
                continue;
            // Check if there's a guard (if/return before the recursive call)
            const hasGuard = body.includes('if') || body.includes('return') && body.indexOf('return') < body.indexOf(`${fnName}(`);
            if (!hasGuard) {
                findings.push({
                    message: `Potential unguarded recursion detected: "${fnName}" calls itself without a visible base case`,
                    severity: 'critical',
                    suggestion: `Add a base case (if/return) before the recursive call to "${fnName}"`,
                });
            }
        }
    }
}
//# sourceMappingURL=logic-loop.js.map