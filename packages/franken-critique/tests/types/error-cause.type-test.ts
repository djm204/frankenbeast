import {
  CircuitBreakerError,
  ConfigurationError,
  CritiqueError,
  EscalationError,
  EvaluationError,
  IntegrationError,
} from '../../src/errors/index.js';
import type { CritiqueErrorOptions } from '../../src/errors/index.js';

const causes: readonly unknown[] = [
  new Error('failure'),
  'string failure',
  { reason: 'object failure' },
  undefined,
];

for (const cause of causes) {
  const options: CritiqueErrorOptions = { cause };

  void new CritiqueError('failed', 'TEST_FAILED', options);
  void new EvaluationError('failed', options);
  void new CircuitBreakerError('failed', options);
  void new EscalationError('failed', options);
  void new IntegrationError('failed', options);
  void new ConfigurationError('failed', options);
}
