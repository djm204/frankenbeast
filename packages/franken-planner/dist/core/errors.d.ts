export declare class CyclicDependencyError extends Error {
    constructor(message: string);
}
export declare class TaskNotFoundError extends Error {
    constructor(taskId: string);
}
export declare class DuplicateTaskError extends Error {
    constructor(taskId: string);
}
export declare class RecursionDepthExceededError extends Error {
    constructor(depth: number);
}
export declare class RationaleRejectedError extends Error {
    readonly taskId: string;
    readonly rejectionReason: string;
    constructor(taskId: string, rejectionReason: string);
}
export declare class MaxRecoveryAttemptsError extends Error {
    readonly taskId: string;
    readonly maxAttempts: number;
    constructor(taskId: string, maxAttempts: number);
}
export declare class UnknownErrorEscalatedError extends Error {
    readonly taskId: string;
    readonly originalError: Error;
    constructor(taskId: string, originalError: Error);
}
//# sourceMappingURL=errors.d.ts.map