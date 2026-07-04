import { ConfigurationError } from '../errors/index.js';

const MIN_MAX_ITERATIONS = 1;
const MAX_MAX_ITERATIONS = 5;

export function assertValidMaxIterations(maxIterations: number): void {
  if (maxIterations < MIN_MAX_ITERATIONS || maxIterations > MAX_MAX_ITERATIONS) {
    throw new ConfigurationError(
      `maxIterations must be between ${MIN_MAX_ITERATIONS} and ${MAX_MAX_ITERATIONS}, got ${maxIterations}`,
      { context: { maxIterations } },
    );
  }
}

export function hasReachedMaxIterations(iterationCount: number, maxIterations: number): boolean {
  assertValidMaxIterations(maxIterations);
  return iterationCount >= maxIterations;
}
