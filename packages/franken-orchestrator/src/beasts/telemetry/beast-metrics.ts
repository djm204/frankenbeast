import type { BeastDispatchSource } from '../types.js';

export interface BeastMetrics {
  recordRunCreated(definitionId: string, source: BeastDispatchSource): void;
  recordRunStopped(definitionId: string): void;
  render(): string;
}
