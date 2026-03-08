/**
 * Critique spiral breaker: checks inside the plan-critique loop.
 * If max iterations exceeded, signals escalation.
 */
export function checkCritiqueSpiral(
  iteration: number,
  maxIterations: number,
  lastScore: number,
): { halt: boolean; reason?: string } {
  if (iteration >= maxIterations) {
    return {
      halt: true,
      reason: `Critique spiral after ${iteration} iterations (last score: ${lastScore})`,
    };
  }
  return { halt: false };
}
