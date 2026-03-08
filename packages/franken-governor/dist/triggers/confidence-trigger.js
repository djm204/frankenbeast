export class ConfidenceTrigger {
    triggerId = 'confidence';
    threshold;
    constructor(threshold = 0.5) {
        this.threshold = threshold;
    }
    evaluate(context) {
        if (context.confidenceScore >= this.threshold) {
            return { triggered: false, triggerId: this.triggerId };
        }
        return {
            triggered: true,
            triggerId: this.triggerId,
            reason: `Low confidence: score ${context.confidenceScore} below threshold ${this.threshold}`,
            severity: 'medium',
        };
    }
}
//# sourceMappingURL=confidence-trigger.js.map