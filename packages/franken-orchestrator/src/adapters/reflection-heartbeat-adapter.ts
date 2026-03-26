import type { IHeartbeatModule, HeartbeatPulseResult } from '../deps.js';

/**
 * Adapts reflection/critique evaluation to the IHeartbeatModule port.
 * In Phase 8, this wraps a CritiqueChain that includes ReflectionEvaluator.
 * For now, provides a simple heartbeat implementation.
 */
export class ReflectionHeartbeatAdapter implements IHeartbeatModule {
  constructor(
    private readonly reflectionFn?: () => Promise<{
      summary: string;
      improvements: string[];
      techDebt: string[];
    }>,
  ) {}

  async pulse(): Promise<HeartbeatPulseResult> {
    if (this.reflectionFn) {
      return this.reflectionFn();
    }
    return {
      improvements: [],
      techDebt: [],
      summary: 'No reflection configured.',
    };
  }
}
