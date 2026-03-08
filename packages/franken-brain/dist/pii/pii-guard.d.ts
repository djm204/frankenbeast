import { EventEmitter } from 'node:events';
import type { IPiiScanner } from './pii-scanner-interface.js';
export interface PiiDetectedEvent {
    fields: string[];
    data: unknown;
}
export declare class PiiDetectedError extends Error {
    readonly fields: string[];
    readonly data: unknown;
    constructor(fields: string[], data: unknown);
}
export declare class PiiGuard extends EventEmitter {
    private readonly scanner;
    constructor(scanner: IPiiScanner);
    check(data: unknown): Promise<void>;
}
//# sourceMappingURL=pii-guard.d.ts.map