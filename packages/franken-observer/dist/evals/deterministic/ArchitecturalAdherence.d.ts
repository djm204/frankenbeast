import type { Eval, EvalResult } from '../types.js';
export interface ADRRule {
    name: string;
    description: string;
    /** Returns true if the output passes this rule. */
    check(output: string): boolean;
}
export interface ArchitecturalAdherenceInput {
    /** The code or text output to validate against the ADR rules. */
    output: string;
    rules: ADRRule[];
}
/**
 * Deterministic eval: checks generated output against a set of
 * Architecture Decision Record (ADR) rules. Fails if any rule is
 * violated; score reflects proportion of passing rules.
 */
export declare class ArchitecturalAdherenceEval implements Eval<ArchitecturalAdherenceInput> {
    readonly name = "architectural-adherence";
    run(input: ArchitecturalAdherenceInput): EvalResult;
}
//# sourceMappingURL=ArchitecturalAdherence.d.ts.map