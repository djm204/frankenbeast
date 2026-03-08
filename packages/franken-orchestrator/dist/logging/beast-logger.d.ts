/**
 * BeastLogger — Reusable color-coded logger for FRANKENBEAST CLI.
 *
 * Uses raw ANSI escape codes (no external dependencies).
 * Provides formatted log levels, budget bars, status badges,
 * boxed headers, and service highlighting for verbose mode.
 */
import type { ILogger } from '../deps.js';
declare const A: {
    readonly reset: "\u001B[0m";
    readonly bold: "\u001B[1m";
    readonly dim: "\u001B[2m";
    readonly red: "\u001B[31m";
    readonly green: "\u001B[32m";
    readonly yellow: "\u001B[33m";
    readonly blue: "\u001B[34m";
    readonly magenta: "\u001B[35m";
    readonly cyan: "\u001B[36m";
    readonly white: "\u001B[37m";
    readonly gray: "\u001B[90m";
    readonly bgRed: "\u001B[41m";
    readonly bgGreen: "\u001B[42m";
};
/** Strip all ANSI escape codes for plain-text output (e.g. log files). */
export declare function stripAnsi(s: string): string;
/**
 * Budget bar: `[████████░░░░░░░░░░░░] 50% ($5.00/$10)`
 * Color: green <50%, yellow 50-75%, red ≥90%.
 */
export declare function budgetBar(spent: number, limit: number): string;
/** Status badge: ` PASS ` on green bg or ` FAIL ` on red bg. */
export declare function statusBadge(pass: boolean): string;
/** Boxed header with `─` and `│` border characters in cyan. */
export declare function logHeader(title: string): string;
export declare const BANNER: string;
export interface BeastLoggerOptions {
    readonly verbose: boolean;
    readonly captureForFile?: boolean;
    /** When set, log entries are appended to this file immediately (crash-safe). */
    readonly logFile?: string | undefined;
}
export declare class BeastLogger implements ILogger {
    private readonly verbose;
    private readonly captureForFile;
    private readonly logFile;
    private readonly entries;
    constructor(options: BeastLoggerOptions);
    info(msg: string, dataOrSource?: unknown, source?: string): void;
    debug(msg: string, dataOrSource?: unknown, source?: string): void;
    warn(msg: string, dataOrSource?: unknown, source?: string): void;
    error(msg: string, dataOrSource?: unknown, source?: string): void;
    /** Get captured log entries for writing to a plain-text log file. */
    getLogEntries(): string[];
    private timestamp;
    private capture;
    private withData;
    private withBadgeAndData;
}
export { A as ANSI };
//# sourceMappingURL=beast-logger.d.ts.map