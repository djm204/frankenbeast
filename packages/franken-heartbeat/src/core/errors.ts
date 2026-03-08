export class HeartbeatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HeartbeatError';
  }
}

export class ChecklistParseError extends HeartbeatError {
  readonly filePath: string;

  constructor(message: string, filePath: string) {
    super(message);
    this.name = 'ChecklistParseError';
    this.filePath = filePath;
  }
}

export class ReflectionError extends HeartbeatError {
  constructor(message: string, cause: Error) {
    super(message);
    this.name = 'ReflectionError';
    this.cause = cause;
  }
}
