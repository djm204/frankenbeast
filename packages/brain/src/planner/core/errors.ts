export class CyclicDependencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CyclicDependencyError';
    Object.setPrototypeOf(this, CyclicDependencyError.prototype);
  }
}

export class TaskNotFoundError extends Error {
  constructor(taskId: string) {
    super(`Task '${taskId}' not found in graph`);
    this.name = 'TaskNotFoundError';
    Object.setPrototypeOf(this, TaskNotFoundError.prototype);
  }
}

export class DuplicateTaskError extends Error {
  constructor(taskId: string) {
    super(`Task '${taskId}' already exists in graph`);
    this.name = 'DuplicateTaskError';
    Object.setPrototypeOf(this, DuplicateTaskError.prototype);
  }
}

export class RecursionDepthExceededError extends Error {
  constructor(depth: number) {
    super(`Recursion depth ${depth} exceeded maximum`);
    this.name = 'RecursionDepthExceededError';
    Object.setPrototypeOf(this, RecursionDepthExceededError.prototype);
  }
}

export class RationaleRejectedError extends Error {
  constructor(
    public readonly taskId: string,
    public readonly rejectionReason: string
  ) {
    super(`Rationale rejected for task '${taskId}': ${rejectionReason}`);
    this.name = 'RationaleRejectedError';
    Object.setPrototypeOf(this, RationaleRejectedError.prototype);
  }
}

export class MaxRecoveryAttemptsError extends Error {
  constructor(
    public readonly taskId: string,
    public readonly maxAttempts: number
  ) {
    super(`Max recovery attempts (${maxAttempts}) exceeded for task '${taskId}'`);
    this.name = 'MaxRecoveryAttemptsError';
    Object.setPrototypeOf(this, MaxRecoveryAttemptsError.prototype);
  }
}

export class UnknownErrorEscalatedError extends Error {
  constructor(
    public readonly taskId: string,
    public readonly originalError: Error
  ) {
    super(`Unknown error in task '${taskId}' escalated to HITL: ${originalError.message}`);
    this.name = 'UnknownErrorEscalatedError';
    Object.setPrototypeOf(this, UnknownErrorEscalatedError.prototype);
  }
}
