const MAX_PARAMS = 5;
const MAX_NESTING = 4;
const MAX_FUNCTION_LINES = 50;
const FUNCTION_PATTERN = /function\s+\w+\s*\(([^)]*)\)\s*\{([\s\S]*?)\}/g;
const ARROW_FUNCTION_PATTERN = /(?:const|let|var)\s+\w+\s*=\s*\(([^)]*)\)\s*(?::\s*\w+\s*)?=>\s*\{([\s\S]*?)\}/g;
export class ComplexityEvaluator {
    name = 'complexity';
    category = 'heuristic';
    async evaluate(input) {
        if (!input.content.trim()) {
            return { evaluatorName: this.name, verdict: 'pass', score: 1, findings: [] };
        }
        const findings = [];
        this.checkParameterCount(input.content, findings);
        this.checkNestingDepth(input.content, findings);
        this.checkFunctionLength(input.content, findings);
        const score = Math.max(0, 1 - findings.length * 0.25);
        return {
            evaluatorName: this.name,
            verdict: findings.length === 0 ? 'pass' : 'fail',
            score,
            findings,
        };
    }
    checkParameterCount(content, findings) {
        for (const pattern of [FUNCTION_PATTERN, ARROW_FUNCTION_PATTERN]) {
            for (const match of content.matchAll(pattern)) {
                const params = match[1]?.trim();
                if (!params)
                    continue;
                const count = params.split(',').filter((p) => p.trim()).length;
                if (count > MAX_PARAMS) {
                    findings.push({
                        message: `Function has ${count} parameters (max ${MAX_PARAMS}). Consider using an options object.`,
                        severity: 'warning',
                        suggestion: 'Group related parameters into an options/config object',
                    });
                }
            }
        }
    }
    checkNestingDepth(content, findings) {
        let maxDepth = 0;
        let currentDepth = 0;
        for (const char of content) {
            if (char === '{') {
                currentDepth++;
                if (currentDepth > maxDepth)
                    maxDepth = currentDepth;
            }
            else if (char === '}') {
                currentDepth = Math.max(0, currentDepth - 1);
            }
        }
        if (maxDepth > MAX_NESTING) {
            findings.push({
                message: `Code nesting depth is ${maxDepth} levels (max ${MAX_NESTING}). Extract nested logic into separate functions.`,
                severity: 'warning',
                suggestion: 'Use early returns, guard clauses, or extract helper functions to reduce nesting',
            });
        }
    }
    checkFunctionLength(content, findings) {
        for (const pattern of [FUNCTION_PATTERN, ARROW_FUNCTION_PATTERN]) {
            for (const match of content.matchAll(pattern)) {
                const body = match[2] ?? '';
                const lineCount = body.split('\n').length;
                if (lineCount > MAX_FUNCTION_LINES) {
                    findings.push({
                        message: `Function is ${lineCount} lines long (max ${MAX_FUNCTION_LINES}). Break it into smaller functions.`,
                        severity: 'warning',
                        suggestion: 'Extract logical sections into well-named helper functions',
                    });
                }
            }
        }
    }
}
//# sourceMappingURL=complexity.js.map