export class CritiqueLoop {
    pipeline;
    breakers;
    constructor(pipeline, breakers) {
        this.pipeline = pipeline;
        this.breakers = breakers;
    }
    async run(input, config) {
        const state = {
            iterationCount: 0,
            iterations: [],
            failureHistory: new Map(),
        };
        while (true) {
            // Pre-check: run all circuit breakers
            const breakerResult = this.checkBreakers(state, config);
            if (breakerResult)
                return breakerResult;
            // Run the evaluation pipeline
            const critiqueResult = await this.pipeline.run(input);
            const iteration = {
                index: state.iterationCount,
                input,
                result: critiqueResult,
                completedAt: new Date().toISOString(),
            };
            state.iterations.push(iteration);
            state.iterationCount++;
            // Pass: return success
            if (critiqueResult.verdict === 'pass') {
                return { verdict: 'pass', iterations: state.iterations };
            }
            // Fail: update failure history
            for (const result of critiqueResult.results) {
                if (result.verdict === 'fail') {
                    const current = state.failureHistory.get(result.evaluatorName) ?? 0;
                    state.failureHistory.set(result.evaluatorName, current + 1);
                }
            }
            // If this is the last possible iteration, return fail with correction
            // (next iteration's breaker check will halt, so build the correction now)
            if (state.iterationCount >= config.maxIterations) {
                return {
                    verdict: 'fail',
                    iterations: state.iterations,
                    correction: this.buildCorrection(critiqueResult, state.iterationCount),
                };
            }
        }
    }
    checkBreakers(state, config) {
        for (const breaker of this.breakers) {
            const result = breaker.check(state, config);
            if (result.tripped) {
                if (result.action === 'escalate') {
                    return {
                        verdict: 'escalated',
                        iterations: state.iterations,
                        escalation: this.buildEscalation(result.reason, state, config),
                    };
                }
                return {
                    verdict: 'halted',
                    iterations: state.iterations,
                    reason: result.reason,
                };
            }
        }
        return null;
    }
    buildCorrection(critiqueResult, iterationCount) {
        const allFindings = critiqueResult.results.flatMap((r) => r.findings);
        const summary = allFindings.map((f) => f.message).join('; ');
        return {
            summary: summary || 'Evaluation failed without specific findings',
            findings: allFindings,
            score: critiqueResult.overallScore,
            iterationCount,
        };
    }
    buildEscalation(reason, state, config) {
        const lastResults = state.iterations.length > 0
            ? state.iterations[state.iterations.length - 1].result.results.map((r) => `${r.evaluatorName}: ${r.verdict}`)
            : [];
        return {
            reason,
            iterationCount: state.iterationCount,
            lastCritiqueResults: lastResults,
            taskId: config.taskId,
            sessionId: config.sessionId,
        };
    }
}
//# sourceMappingURL=critique-loop.js.map