import type { Eval, EvalResult } from '../types.js';
export interface ToolCallSchema {
    tool: string;
    required: string[];
    /** All params the tool accepts. Must be a superset of required. */
    allowed: string[];
}
export interface ToolCallAccuracyInput {
    actual: {
        tool: string;
        params: Record<string, unknown>;
    };
    schema: ToolCallSchema;
}
/**
 * Deterministic eval: verifies an agent tool call has the correct tool
 * name, all required params present, and no ghost (hallucinated) params.
 */
export declare class ToolCallAccuracyEval implements Eval<ToolCallAccuracyInput> {
    readonly name = "tool-call-accuracy";
    run(input: ToolCallAccuracyInput): EvalResult;
}
//# sourceMappingURL=ToolCallAccuracy.d.ts.map