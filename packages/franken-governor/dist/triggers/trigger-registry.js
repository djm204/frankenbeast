export class TriggerRegistry {
    evaluators;
    constructor(evaluators) {
        this.evaluators = evaluators;
    }
    evaluateAll(context) {
        for (const evaluator of this.evaluators) {
            const result = evaluator.evaluate(context);
            if (result.triggered) {
                return result;
            }
        }
        return { triggered: false, triggerId: 'none' };
    }
}
//# sourceMappingURL=trigger-registry.js.map