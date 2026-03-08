const SAFETY_EVALUATOR_NAME = 'safety';
export class CritiquePipeline {
    evaluators;
    constructor(evaluators) {
        // Sort: deterministic first, then heuristic
        this.evaluators = [...evaluators].sort((a, b) => {
            if (a.category === b.category)
                return 0;
            return a.category === 'deterministic' ? -1 : 1;
        });
    }
    async run(input) {
        if (this.evaluators.length === 0) {
            return { verdict: 'pass', overallScore: 1, results: [], shortCircuited: false };
        }
        const results = [];
        let shortCircuited = false;
        for (const evaluator of this.evaluators) {
            const result = await evaluator.evaluate(input);
            results.push(result);
            // Short-circuit on safety failure
            if (evaluator.name === SAFETY_EVALUATOR_NAME && result.verdict === 'fail') {
                shortCircuited = true;
                break;
            }
        }
        const overallScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
        const hasFailure = results.some((r) => r.verdict === 'fail');
        return {
            verdict: hasFailure ? 'fail' : 'pass',
            overallScore,
            results,
            shortCircuited,
        };
    }
}
//# sourceMappingURL=critique-pipeline.js.map