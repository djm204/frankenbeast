export class CyclicDependencyError extends Error {
    constructor(message) {
        super(message);
        this.name = 'CyclicDependencyError';
        Object.setPrototypeOf(this, CyclicDependencyError.prototype);
    }
}
export class TaskNotFoundError extends Error {
    constructor(taskId) {
        super(`Task '${taskId}' not found in graph`);
        this.name = 'TaskNotFoundError';
        Object.setPrototypeOf(this, TaskNotFoundError.prototype);
    }
}
export class DuplicateTaskError extends Error {
    constructor(taskId) {
        super(`Task '${taskId}' already exists in graph`);
        this.name = 'DuplicateTaskError';
        Object.setPrototypeOf(this, DuplicateTaskError.prototype);
    }
}
export class RecursionDepthExceededError extends Error {
    constructor(depth) {
        super(`Recursion depth ${depth} exceeded maximum`);
        this.name = 'RecursionDepthExceededError';
        Object.setPrototypeOf(this, RecursionDepthExceededError.prototype);
    }
}
export class RationaleRejectedError extends Error {
    taskId;
    rejectionReason;
    constructor(taskId, rejectionReason) {
        super(`Rationale rejected for task '${taskId}': ${rejectionReason}`);
        this.taskId = taskId;
        this.rejectionReason = rejectionReason;
        this.name = 'RationaleRejectedError';
        Object.setPrototypeOf(this, RationaleRejectedError.prototype);
    }
}
export class MaxRecoveryAttemptsError extends Error {
    taskId;
    maxAttempts;
    constructor(taskId, maxAttempts) {
        super(`Max recovery attempts (${maxAttempts}) exceeded for task '${taskId}'`);
        this.taskId = taskId;
        this.maxAttempts = maxAttempts;
        this.name = 'MaxRecoveryAttemptsError';
        Object.setPrototypeOf(this, MaxRecoveryAttemptsError.prototype);
    }
}
export class UnknownErrorEscalatedError extends Error {
    taskId;
    originalError;
    constructor(taskId, originalError) {
        super(`Unknown error in task '${taskId}' escalated to HITL: ${originalError.message}`);
        this.taskId = taskId;
        this.originalError = originalError;
        this.name = 'UnknownErrorEscalatedError';
        Object.setPrototypeOf(this, UnknownErrorEscalatedError.prototype);
    }
}
//# sourceMappingURL=errors.js.map