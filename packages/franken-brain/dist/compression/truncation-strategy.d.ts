import type { WorkingTurn } from '../types/index.js';
import type { ICompressionStrategy, CompressionResult } from '../working/compression-strategy.js';
export declare class TruncationStrategy implements ICompressionStrategy {
    compress(candidates: WorkingTurn[], budget: number): Promise<CompressionResult>;
}
//# sourceMappingURL=truncation-strategy.d.ts.map