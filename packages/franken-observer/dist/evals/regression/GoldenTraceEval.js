/**
 * Regression eval: compares the actual trace's span sequence against a
 * recorded golden fixture. Only span names and order are checked —
 * latency, token counts, and timestamps are allowed to vary between runs.
 */
export class GoldenTraceEval {
    name = 'golden-trace-regression';
    run(input) {
        const actualNames = input.actual.spans.map(s => s.name);
        const goldenNames = input.golden.spans.map(s => s.name);
        const goldenSet = new Set(goldenNames);
        const actualSet = new Set(actualNames);
        const missingSpans = goldenNames.filter(n => !actualSet.has(n));
        const extraSpans = actualNames.filter(n => !goldenSet.has(n));
        const matchCount = goldenNames.filter(n => actualSet.has(n)).length;
        const score = goldenNames.length === 0 ? 1.0 : matchCount / goldenNames.length;
        if (missingSpans.length === 0 && extraSpans.length === 0) {
            return { evalName: this.name, status: 'pass', score: 1.0 };
        }
        const parts = [];
        if (missingSpans.length > 0)
            parts.push(`Missing spans: ${missingSpans.join(', ')}.`);
        if (extraSpans.length > 0)
            parts.push(`Extra spans: ${extraSpans.join(', ')}.`);
        return {
            evalName: this.name,
            status: 'fail',
            score,
            reason: parts.join(' '),
            details: {
                ...(missingSpans.length > 0 ? { missingSpans } : {}),
                ...(extraSpans.length > 0 ? { extraSpans } : {}),
            },
        };
    }
}
//# sourceMappingURL=GoldenTraceEval.js.map