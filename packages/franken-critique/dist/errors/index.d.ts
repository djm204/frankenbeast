export interface CritiqueErrorOptions {
    readonly context?: Readonly<Record<string, unknown>>;
    readonly cause?: Error;
}
export declare class CritiqueError extends Error {
    readonly code: string;
    readonly context: Readonly<Record<string, unknown>>;
    constructor(message: string, code: string, options?: CritiqueErrorOptions);
}
export declare class EvaluationError extends CritiqueError {
    constructor(message: string, options?: CritiqueErrorOptions);
}
export declare class CircuitBreakerError extends CritiqueError {
    constructor(message: string, options?: CritiqueErrorOptions);
}
export declare class EscalationError extends CritiqueError {
    constructor(message: string, options?: CritiqueErrorOptions);
}
export declare class IntegrationError extends CritiqueError {
    constructor(message: string, options?: CritiqueErrorOptions);
}
export declare class ConfigurationError extends CritiqueError {
    constructor(message: string, options?: CritiqueErrorOptions);
}
//# sourceMappingURL=index.d.ts.map