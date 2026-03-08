export class CritiqueError extends Error {
    code;
    context;
    constructor(message, code, options) {
        super(message, { cause: options?.cause });
        this.name = 'CritiqueError';
        this.code = code;
        this.context = options?.context ?? {};
    }
}
export class EvaluationError extends CritiqueError {
    constructor(message, options) {
        super(message, 'EVALUATION_FAILED', options);
        this.name = 'EvaluationError';
    }
}
export class CircuitBreakerError extends CritiqueError {
    constructor(message, options) {
        super(message, 'CIRCUIT_BREAKER_TRIPPED', options);
        this.name = 'CircuitBreakerError';
    }
}
export class EscalationError extends CritiqueError {
    constructor(message, options) {
        super(message, 'ESCALATION_TRIGGERED', options);
        this.name = 'EscalationError';
    }
}
export class IntegrationError extends CritiqueError {
    constructor(message, options) {
        super(message, 'INTEGRATION_FAILED', options);
        this.name = 'IntegrationError';
    }
}
export class ConfigurationError extends CritiqueError {
    constructor(message, options) {
        super(message, 'CONFIGURATION_INVALID', options);
        this.name = 'ConfigurationError';
    }
}
//# sourceMappingURL=index.js.map