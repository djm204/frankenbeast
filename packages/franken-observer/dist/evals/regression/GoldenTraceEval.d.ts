import type { Trace } from '../../core/types.js';
import type { Eval, EvalResult } from '../types.js';
export interface GoldenSpan {
    name: string;
}
/**
 * A serialisable golden-trace fixture. Timestamps and metadata are
 * intentionally omitted — only the structural span sequence is compared.
 */
export interface GoldenTrace {
    goal: string;
    spans: GoldenSpan[];
}
export interface GoldenTraceInput {
    actual: Trace;
    golden: GoldenTrace;
}
/**
 * Regression eval: compares the actual trace's span sequence against a
 * recorded golden fixture. Only span names and order are checked —
 * latency, token counts, and timestamps are allowed to vary between runs.
 */
export declare class GoldenTraceEval implements Eval<GoldenTraceInput> {
    readonly name = "golden-trace-regression";
    run(input: GoldenTraceInput): EvalResult;
}
//# sourceMappingURL=GoldenTraceEval.d.ts.map