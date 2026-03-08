export interface CritiqueErrorOptions {
  readonly context?: Readonly<Record<string, unknown>>;
  readonly cause?: Error;
}

export class CritiqueError extends Error {
  readonly code: string;
  readonly context: Readonly<Record<string, unknown>>;

  constructor(message: string, code: string, options?: CritiqueErrorOptions) {
    super(message, { cause: options?.cause });
    this.name = 'CritiqueError';
    this.code = code;
    this.context = options?.context ?? {};
  }
}

export class EvaluationError extends CritiqueError {
  constructor(message: string, options?: CritiqueErrorOptions) {
    super(message, 'EVALUATION_FAILED', options);
    this.name = 'EvaluationError';
  }
}

export class CircuitBreakerError extends CritiqueError {
  constructor(message: string, options?: CritiqueErrorOptions) {
    super(message, 'CIRCUIT_BREAKER_TRIPPED', options);
    this.name = 'CircuitBreakerError';
  }
}

export class EscalationError extends CritiqueError {
  constructor(message: string, options?: CritiqueErrorOptions) {
    super(message, 'ESCALATION_TRIGGERED', options);
    this.name = 'EscalationError';
  }
}

export class IntegrationError extends CritiqueError {
  constructor(message: string, options?: CritiqueErrorOptions) {
    super(message, 'INTEGRATION_FAILED', options);
    this.name = 'IntegrationError';
  }
}

export class ConfigurationError extends CritiqueError {
  constructor(message: string, options?: CritiqueErrorOptions) {
    super(message, 'CONFIGURATION_INVALID', options);
    this.name = 'ConfigurationError';
  }
}
