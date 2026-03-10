import type { WorkingTurn } from '../types/index.js';

export interface CompressionResult {
  /** Single summary turn that replaces the compressed candidates. */
  summary: WorkingTurn;
  /** How many candidate turns were dropped. */
  droppedCount: number;
}

export interface ICompressionStrategy {
  compress(candidates: WorkingTurn[], budget: number): Promise<CompressionResult>;
}
