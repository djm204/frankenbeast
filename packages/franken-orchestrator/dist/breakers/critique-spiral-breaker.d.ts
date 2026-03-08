/**
 * Critique spiral breaker: checks inside the plan-critique loop.
 * If max iterations exceeded, signals escalation.
 */
export declare function checkCritiqueSpiral(iteration: number, maxIterations: number, lastScore: number): {
    halt: boolean;
    reason?: string;
};
//# sourceMappingURL=critique-spiral-breaker.d.ts.map