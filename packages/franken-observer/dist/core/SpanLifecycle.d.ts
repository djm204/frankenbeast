import type { Span } from './types.js';
import type { TokenCounter } from '../cost/TokenCounter.js';
export interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
    model?: string;
}
export declare const SpanLifecycle: {
    setMetadata(span: Span, data: Record<string, unknown>): void;
    addThoughtBlock(span: Span, thought: string): void;
    recordTokenUsage(span: Span, usage: TokenUsage, counter?: TokenCounter): void;
};
//# sourceMappingURL=SpanLifecycle.d.ts.map