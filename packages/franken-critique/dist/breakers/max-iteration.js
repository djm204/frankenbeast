import { ConfigurationError } from '../errors/index.js';
export class MaxIterationBreaker {
    name = 'max-iteration';
    check(state, config) {
        if (config.maxIterations < 1 || config.maxIterations > 5) {
            throw new ConfigurationError(`maxIterations must be between 1 and 5, got ${config.maxIterations}`, { context: { maxIterations: config.maxIterations } });
        }
        if (state.iterationCount >= config.maxIterations) {
            return {
                tripped: true,
                reason: `Maximum iterations reached (${config.maxIterations})`,
                action: 'halt',
            };
        }
        return { tripped: false };
    }
}
//# sourceMappingURL=max-iteration.js.map