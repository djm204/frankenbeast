export declare class HeartbeatError extends Error {
    constructor(message: string);
}
export declare class ChecklistParseError extends HeartbeatError {
    readonly filePath: string;
    constructor(message: string, filePath: string);
}
export declare class ReflectionError extends HeartbeatError {
    constructor(message: string, cause: Error);
}
//# sourceMappingURL=errors.d.ts.map