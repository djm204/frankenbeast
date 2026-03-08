import { describe, it, expect } from 'vitest';
import {
  CritiqueError,
  EvaluationError,
  CircuitBreakerError,
  EscalationError,
  IntegrationError,
  ConfigurationError,
} from '../../../src/errors/index.js';

describe('CritiqueError', () => {
  it('extends Error', () => {
    const error = new CritiqueError('test message', 'TEST_CODE');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(CritiqueError);
  });

  it('has message, code, and name', () => {
    const error = new CritiqueError('something failed', 'CRITIQUE_FAILED');
    expect(error.message).toBe('something failed');
    expect(error.code).toBe('CRITIQUE_FAILED');
    expect(error.name).toBe('CritiqueError');
  });

  it('has empty context by default', () => {
    const error = new CritiqueError('test', 'TEST');
    expect(error.context).toEqual({});
  });

  it('accepts context', () => {
    const ctx = { evaluator: 'safety', iteration: 2 };
    const error = new CritiqueError('test', 'TEST', { context: ctx });
    expect(error.context).toEqual(ctx);
  });

  it('chains cause', () => {
    const cause = new Error('root cause');
    const error = new CritiqueError('wrapper', 'WRAP', { cause });
    expect(error.cause).toBe(cause);
  });

  it('accepts both context and cause', () => {
    const cause = new Error('root');
    const ctx = { key: 'value' };
    const error = new CritiqueError('msg', 'CODE', { context: ctx, cause });
    expect(error.context).toEqual(ctx);
    expect(error.cause).toBe(cause);
  });
});

describe('EvaluationError', () => {
  it('extends CritiqueError', () => {
    const error = new EvaluationError('eval failed');
    expect(error).toBeInstanceOf(CritiqueError);
    expect(error).toBeInstanceOf(EvaluationError);
  });

  it('has correct code and name', () => {
    const error = new EvaluationError('eval failed');
    expect(error.code).toBe('EVALUATION_FAILED');
    expect(error.name).toBe('EvaluationError');
  });

  it('passes context and cause through', () => {
    const cause = new Error('inner');
    const error = new EvaluationError('msg', {
      context: { evaluator: 'safety' },
      cause,
    });
    expect(error.context).toEqual({ evaluator: 'safety' });
    expect(error.cause).toBe(cause);
  });
});

describe('CircuitBreakerError', () => {
  it('extends CritiqueError with correct code', () => {
    const error = new CircuitBreakerError('breaker tripped');
    expect(error).toBeInstanceOf(CritiqueError);
    expect(error.code).toBe('CIRCUIT_BREAKER_TRIPPED');
    expect(error.name).toBe('CircuitBreakerError');
  });
});

describe('EscalationError', () => {
  it('extends CritiqueError with correct code', () => {
    const error = new EscalationError('needs human');
    expect(error).toBeInstanceOf(CritiqueError);
    expect(error.code).toBe('ESCALATION_TRIGGERED');
    expect(error.name).toBe('EscalationError');
  });
});

describe('IntegrationError', () => {
  it('extends CritiqueError with correct code', () => {
    const error = new IntegrationError('MOD-03 unreachable');
    expect(error).toBeInstanceOf(CritiqueError);
    expect(error.code).toBe('INTEGRATION_FAILED');
    expect(error.name).toBe('IntegrationError');
  });

  it('wraps an external error as cause', () => {
    const external = new Error('ECONNREFUSED');
    const error = new IntegrationError('MOD-03 down', { cause: external });
    expect(error.cause).toBe(external);
  });
});

describe('ConfigurationError', () => {
  it('extends CritiqueError with correct code', () => {
    const error = new ConfigurationError('invalid config');
    expect(error).toBeInstanceOf(CritiqueError);
    expect(error.code).toBe('CONFIGURATION_INVALID');
    expect(error.name).toBe('ConfigurationError');
  });
});
