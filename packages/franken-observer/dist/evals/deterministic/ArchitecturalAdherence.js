/**
 * Deterministic eval: checks generated output against a set of
 * Architecture Decision Record (ADR) rules. Fails if any rule is
 * violated; score reflects proportion of passing rules.
 */
export class ArchitecturalAdherenceEval {
    name = 'architectural-adherence';
    run(input) {
        const { output, rules } = input;
        if (rules.length === 0) {
            return { evalName: this.name, status: 'pass', score: 1.0 };
        }
        const violated = rules.filter(r => !r.check(output));
        const score = (rules.length - violated.length) / rules.length;
        if (violated.length === 0) {
            return { evalName: this.name, status: 'pass', score: 1.0 };
        }
        const reason = violated
            .map(r => `[${r.name}] ${r.description}`)
            .join('; ');
        return {
            evalName: this.name,
            status: 'fail',
            score,
            reason,
            details: { violatedRules: violated.map(r => r.name) },
        };
    }
}
//# sourceMappingURL=ArchitecturalAdherence.js.map