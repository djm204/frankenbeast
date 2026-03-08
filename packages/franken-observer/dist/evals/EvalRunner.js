export class EvalRunner {
    async run(ev, input) {
        try {
            return await Promise.resolve(ev.run(input));
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return {
                evalName: ev.name,
                status: 'fail',
                reason: `Eval threw an unexpected error: ${message}`,
            };
        }
    }
    async runAll(evals, input) {
        const results = [];
        for (const ev of evals) {
            results.push(await this.run(ev, input));
        }
        return results;
    }
}
//# sourceMappingURL=EvalRunner.js.map