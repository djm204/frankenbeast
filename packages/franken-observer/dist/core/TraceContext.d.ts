import type { Trace, Span, StartSpanOptions, EndSpanOptions } from './types.js';
import type { LoopDetector } from '../incident/LoopDetector.js';
export declare const TraceContext: {
    createTrace(goal: string): Trace;
    startSpan(trace: Trace, options: StartSpanOptions): Span;
    endSpan(span: Span, options?: EndSpanOptions, loopDetector?: LoopDetector): void;
    endTrace(trace: Trace): void;
};
//# sourceMappingURL=TraceContext.d.ts.map