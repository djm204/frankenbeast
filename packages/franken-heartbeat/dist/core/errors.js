export class HeartbeatError extends Error {
    constructor(message) {
        super(message);
        this.name = 'HeartbeatError';
    }
}
export class ChecklistParseError extends HeartbeatError {
    filePath;
    constructor(message, filePath) {
        super(message);
        this.name = 'ChecklistParseError';
        this.filePath = filePath;
    }
}
export class ReflectionError extends HeartbeatError {
    constructor(message, cause) {
        super(message);
        this.name = 'ReflectionError';
        this.cause = cause;
    }
}
//# sourceMappingURL=errors.js.map