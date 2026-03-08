import type { ILogger } from './deps.js';
export declare class ConsoleLogger implements ILogger {
    private readonly verbose;
    constructor(options: {
        verbose: boolean;
    });
    info(msg: string, _data?: unknown): void;
    debug(msg: string, data?: unknown): void;
    warn(msg: string, _data?: unknown): void;
    error(msg: string, _data?: unknown): void;
}
export declare class NullLogger implements ILogger {
    info(_msg: string, _data?: unknown): void;
    debug(_msg: string, _data?: unknown): void;
    warn(_msg: string, _data?: unknown): void;
    error(_msg: string, _data?: unknown): void;
}
//# sourceMappingURL=logger.d.ts.map