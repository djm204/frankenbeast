export class CritiquePortAdapter {
    loop;
    config;
    source;
    constructor(config) {
        this.loop = config.loop;
        this.config = config.config;
        this.source = config.source;
    }
    async reviewPlan(plan, context) {
        const input = {
            content: JSON.stringify(plan),
            source: this.source,
            metadata: {
                taskCount: plan.tasks.length,
                context,
            },
        };
        const loopResult = await this.loop.run(input, this.config);
        return this.mapResult(loopResult);
    }
    mapResult(loopResult) {
        const lastIteration = loopResult.iterations[loopResult.iterations.length - 1];
        const lastResult = lastIteration?.result;
        const findings = lastResult ? this.mapFindings(lastResult.results) : [];
        if (loopResult.verdict === 'pass') {
            return {
                verdict: 'pass',
                findings,
                score: lastResult?.overallScore ?? 0,
            };
        }
        if (loopResult.verdict === 'fail') {
            const correctionFindings = loopResult.correction.findings.map(finding => ({
                evaluator: 'critique-loop',
                severity: finding.severity,
                message: finding.message,
            }));
            const normalizedFindings = findings.length > 0
                ? findings
                : correctionFindings.length > 0
                    ? correctionFindings
                    : [{ evaluator: 'critique-loop', severity: 'high', message: loopResult.correction.summary }];
            return {
                verdict: 'fail',
                findings: normalizedFindings,
                score: loopResult.correction.score ?? lastResult?.overallScore ?? 0,
            };
        }
        if (loopResult.verdict === 'halted') {
            return {
                verdict: 'fail',
                findings: [{ evaluator: 'critique-loop', severity: 'high', message: loopResult.reason }],
                score: lastResult?.overallScore ?? 0,
            };
        }
        return {
            verdict: 'fail',
            findings: [{ evaluator: 'critique-loop', severity: 'high', message: loopResult.escalation.reason }],
            score: lastResult?.overallScore ?? 0,
        };
    }
    mapFindings(results) {
        return results.flatMap(result => result.findings.map(finding => ({
            evaluator: result.evaluatorName,
            severity: finding.severity,
            message: finding.message,
        })));
    }
}
//# sourceMappingURL=critique-adapter.js.map