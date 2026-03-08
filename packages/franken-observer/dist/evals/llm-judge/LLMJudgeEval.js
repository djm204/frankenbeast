/**
 * LLM-as-a-Judge eval. Uses a configurable judge function so the eval
 * can be run in tests with a mock, and in production with a real LLM.
 * The EvalRunner catches errors, but LLMJudgeEval also handles judge
 * errors explicitly to produce informative failure messages.
 */
export class LLMJudgeEval {
    name;
    buildPrompt;
    judge;
    passThreshold;
    constructor(options) {
        this.name = options.name;
        this.buildPrompt = options.buildPrompt;
        this.judge = options.judge;
        this.passThreshold = options.passThreshold ?? 0.7;
    }
    async run(input) {
        const prompt = this.buildPrompt(input);
        let response;
        try {
            response = await this.judge(prompt);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return {
                evalName: this.name,
                status: 'fail',
                reason: `Judge function failed: ${message}`,
            };
        }
        const status = response.score >= this.passThreshold ? 'pass' : 'fail';
        return {
            evalName: this.name,
            status,
            score: response.score,
            reason: response.reason,
        };
    }
}
//# sourceMappingURL=LLMJudgeEval.js.map