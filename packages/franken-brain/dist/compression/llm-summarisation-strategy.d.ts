import type { WorkingTurn } from '../types/index.js';
import type { ICompressionStrategy, CompressionResult } from '../working/compression-strategy.js';
import type { ILlmClient } from './llm-client-interface.js';
export declare class LlmSummarisationStrategy implements ICompressionStrategy {
    private readonly llm;
    private readonly fallback;
    constructor(llm: ILlmClient);
    compress(candidates: WorkingTurn[], budget: number): Promise<CompressionResult>;
}
//# sourceMappingURL=llm-summarisation-strategy.d.ts.map