/**
 * Critique spiral breaker: checks inside the plan-critique loop.
 * If max iterations exceeded, signals escalation.
 */
export function checkCritiqueSpiral(iteration, maxIterations, lastScore) {
    if (iteration >= maxIterations) {
        return {
            halt: true,
            reason: `Critique spiral after ${iteration} iterations (last score: ${lastScore})`,
        };
    }
    return { halt: false };
}
//# sourceMappingURL=critique-spiral-breaker.js.map