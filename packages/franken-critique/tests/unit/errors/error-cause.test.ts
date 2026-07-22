import { describe, expect, it } from 'vitest';
import {
  CircuitBreakerError,
  ConfigurationError,
  CritiqueError,
  EscalationError,
  EvaluationError,
  IntegrationError,
} from '../../../src/errors/index.js';

const errorFactories = [
  (cause: unknown): CritiqueError =>
    new CritiqueError('failed', 'TEST_FAILED', { cause }),
  (cause: unknown): CritiqueError => new EvaluationError('failed', { cause }),
  (cause: unknown): CritiqueError =>
    new CircuitBreakerError('failed', { cause }),
  (cause: unknown): CritiqueError => new EscalationError('failed', { cause }),
  (cause: unknown): CritiqueError => new IntegrationError('failed', { cause }),
  (cause: unknown): CritiqueError =>
    new ConfigurationError('failed', { cause }),
] as const;

const causes: readonly unknown[] = [
  new Error('failure'),
  'string failure',
  { reason: 'object failure' },
  undefined,
];

describe('critique error causes', () => {
  it.each(errorFactories)(
    'preserves arbitrary thrown values',
    (createError) => {
      for (const cause of causes) {
        expect(createError(cause).cause).toBe(cause);
      }
    },
  );
});
