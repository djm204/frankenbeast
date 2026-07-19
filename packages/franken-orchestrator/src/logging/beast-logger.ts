import { now as deterministicNow } from '@franken/types';
/**
 * BeastLogger — Reusable color-coded logger for FRANKENBEAST CLI.
 *
 * Uses raw ANSI escape codes (no external dependencies).
 * Provides formatted log levels, budget bars, status badges,
 * boxed headers, and service highlighting for verbose mode.
 */

import { closeSync, existsSync, openSync, renameSync, statSync, truncateSync, writeSync } from 'node:fs';
import type { ILogger } from '../deps.js';
import { isCommandFailure } from '../errors/command-failure.js';
import { redactLogData, redactSensitiveText } from './redaction.js';


function printLine(...args: unknown[]): void {
  console.info(...args);
}
// ── ANSI escape codes ──

const A = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
} as const;

// ── Utility functions ──

/** Strip all ANSI escape codes for plain-text output (e.g. log files). */
export function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Budget bar: `[████████░░░░░░░░░░░░] 50% ($5.00/$10)`
 * Color: green <50%, yellow 50-75%, red ≥90%.
 */
export function budgetBar(spent: number, limit: number): string {
  const pct = Math.min(spent / limit, 1);
  const w = 20;
  const filled = Math.round(pct * w);
  const empty = w - filled;
  const barColor = pct >= 0.9 ? A.red : pct >= 0.75 ? A.yellow : A.green;
  return `${barColor}[${'█'.repeat(filled)}${A.gray}${'░'.repeat(empty)}${barColor}]${A.reset} ${Math.round(pct * 100)}% ($${spent.toFixed(2)}/$${limit.toFixed(0)})`;
}

/** Status badge: ` PASS ` on green bg or ` FAIL ` on red bg. */
export function statusBadge(pass: boolean | 'neutral'): string {
  if (pass === 'neutral') {
    return `${A.yellow}${A.bold} NO-OP ${A.reset}`;
  }
  return pass
    ? `${A.bgGreen}${A.bold} PASS ${A.reset}`
    : `${A.bgRed}${A.bold} FAIL ${A.reset}`;
}

/** Boxed header with `─` and `│` border characters in cyan. */
export function logHeader(title: string): string {
  const line = `${A.cyan}${'─'.repeat(60)}${A.reset}`;
  return `\n${line}\n${A.cyan}│${A.reset} ${A.bold}${title}${A.reset}\n${line}`;
}

// ── Banner ──

/** Green ANSI Shadow wordmark matching the Hermes CLI startup style. */
export const BANNER = `\n${A.green}${A.bold}` +
  '███████╗██████╗  █████╗ ███╗   ██╗██╗  ██╗███████╗███╗   ██╗██████╗ ███████╗ █████╗ ███████╗████████╗\n' +
  '██╔════╝██╔══██╗██╔══██╗████╗  ██║██║ ██╔╝██╔════╝████╗  ██║██╔══██╗██╔════╝██╔══██╗██╔════╝╚══██╔══╝\n' +
  '█████╗  ██████╔╝███████║██╔██╗ ██║█████╔╝ █████╗  ██╔██╗ ██║██████╔╝█████╗  ███████║███████╗   ██║   \n' +
  '██╔══╝  ██╔══██╗██╔══██║██║╚██╗██║██╔═██╗ ██╔══╝  ██║╚██╗██║██╔══██╗██╔══╝  ██╔══██║╚════██║   ██║   \n' +
  '██║     ██║  ██║██║  ██║██║ ╚████║██║  ██╗███████╗██║ ╚████║██████╔╝███████╗██║  ██║███████║   ██║   \n' +
  '╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═══╝╚═════╝ ╚══════╝╚═╝  ╚═╝╚══════╝   ╚═╝   ' +
  `${A.reset}\n`;

export async function renderBanner(_root: string): Promise<string> {
  return BANNER;
}

// ── Service badge ──

const BADGE_COLORS: Record<string, string> = {
  martin: A.cyan,
  git: A.yellow,
  observer: A.magenta,
  planner: A.blue,
  session: A.green,
  budget: A.red,
  config: A.white,
};

const BADGE_WIDTH = 10;
const DEFAULT_MAX_LOG_FILE_BYTES = 10 * 1024 * 1024;
const DEFAULT_ROTATED_LOG_FILES = 3;

function formatBadge(source: string): string {
  const color = BADGE_COLORS[source] ?? A.dim;
  const badge = `[${source}]`;
  const padded = badge.padEnd(BADGE_WIDTH);
  return `${color}${padded}${A.reset} `;
}

/**
 * Resolve overloaded (msg, dataOrSource?, source?) arguments.
 * When the second arg is a string and the third is undefined,
 * treat the second arg as the source (not data).
 */
function resolveArgs(dataOrSource?: unknown, source?: string): { data: unknown; source: string | undefined } {
  if (typeof dataOrSource === 'string' && source === undefined) {
    return { data: undefined, source: dataOrSource };
  }
  return { data: dataOrSource, source };
}

// ── Service highlighting ──

function highlightServices(msg: string): string {
  return msg
    .replace(/\[claude\]/g, `${A.magenta}${A.bold}[claude]${A.reset}${A.gray}`)
    .replace(/\[codex\]/g, `${A.blue}${A.bold}[codex]${A.reset}${A.gray}`)
    .replace(/(→\s*\w+:)/g, `${A.cyan}$1${A.reset}${A.gray}`)
    .replace(/(←\s*result:)/g, `${A.green}$1${A.reset}${A.gray}`)
    .replace(/(git\s+[^\s].*?)(?=$|\n)/g, `${A.green}$1${A.reset}${A.gray}`);
}

// ── BeastLogger class ──

export interface BeastLoggerOptions {
  readonly verbose: boolean;
  readonly captureForFile?: boolean;
  /**
   * Redact secret-looking environment/config keys from terminal and file logs.
   * Defaults to true; set false only for an explicit local diagnostic override.
   */
  readonly redactSecrets?: boolean | undefined;
  /** When set, log entries are appended to this file immediately (crash-safe). */
  readonly logFile?: string | undefined;
  /** Maximum active log file size before rotating to .1, .2, etc. Defaults to 10 MiB. */
  readonly maxLogFileBytes?: number | undefined;
  /** Number of rotated log files to keep. Defaults to 3. */
  readonly maxRotatedLogFiles?: number | undefined;
}

export class BeastLogger implements ILogger {
  private readonly verbose: boolean;
  private readonly captureForFile: boolean;
  private readonly redactSecrets: boolean;
  private readonly logFile: string | undefined;
  private readonly maxLogFileBytes: number;
  private readonly maxRotatedLogFiles: number;
  private readonly entries: string[] = [];
  private logFd: number | undefined;
  private logBytes = 0;

  constructor(options: BeastLoggerOptions) {
    this.verbose = options.verbose;
    this.captureForFile = options.captureForFile ?? false;
    this.redactSecrets = options.redactSecrets ?? true;
    this.logFile = options.logFile;
    this.maxLogFileBytes = options.maxLogFileBytes ?? DEFAULT_MAX_LOG_FILE_BYTES;
    this.maxRotatedLogFiles = options.maxRotatedLogFiles ?? DEFAULT_ROTATED_LOG_FILES;
  }

  info(msg: string, dataOrSource?: unknown, source?: string): void {
    const { data, source: src } = resolveArgs(dataOrSource, source);
    const ts = this.timestamp();
    const badge = src ? formatBadge(src) : '';
    const safeMsg = this.redactMessage(msg);
    const display = data !== undefined ? `${safeMsg}  ${formatCompact(data, this.redactSecrets)}` : safeMsg;
    printLine(`${ts} ${A.cyan}${A.bold} INFO${A.reset} ${badge}${display}`);
    this.capture('INFO', this.withBadgeAndData(msg, data, src));
  }

  debug(msg: string, dataOrSource?: unknown, source?: string): void {
    const { data, source: src } = resolveArgs(dataOrSource, source);
    const line = this.withData(msg, data);
    const badgeText = src ? `[${src}] ` : '';
    // Always capture to build.log; only print to terminal in verbose mode
    this.capture('DEBUG', `${badgeText}${line}`);
    if (!this.verbose) return;
    const ts = this.timestamp();
    const badge = src ? formatBadge(src) : '';
    const highlighted = highlightServices(line);
    printLine(`${ts} ${A.gray}DEBUG ${badge}${highlighted}${A.reset}`);
  }

  warn(msg: string, dataOrSource?: unknown, source?: string): void {
    const { data, source: src } = resolveArgs(dataOrSource, source);
    const ts = this.timestamp();
    const badge = src ? formatBadge(src) : '';
    const safeMsg = this.redactMessage(msg);
    const display = data !== undefined ? `${safeMsg}  ${formatCompact(data, this.redactSecrets)}` : safeMsg;
    printLine(`${ts} ${A.yellow}${A.bold} WARN${A.reset} ${badge}${A.yellow}${display}${A.reset}`);
    this.capture('WARN', this.withBadgeAndData(msg, data, src));
  }

  error(msg: string, dataOrSource?: unknown, source?: string): void {
    const { data, source: src } = resolveArgs(dataOrSource, source);
    const ts = this.timestamp();
    const badge = src ? formatBadge(src) : '';
    const line = this.withData(msg, data);
    printLine(`${ts} ${A.red}${A.bold}ERROR${A.reset} ${badge}${A.red}${line}${A.reset}`);
    this.capture('ERROR', this.withBadgeAndData(msg, data, src));
  }

  /** Get captured log entries for writing to a plain-text log file. */
  getLogEntries(): string[] {
    return [...this.entries];
  }

  /** Flush and close the persistent log file handle, if one was opened. */
  close(): void {
    if (this.logFd === undefined) return;
    closeSync(this.logFd);
    this.logFd = undefined;
  }

  private timestamp(): string {
    return `${A.gray}${new Date(deterministicNow()).toTimeString().slice(0, 8)}${A.reset}`;
  }

  private capture(level: string, msg: string): void {
    if (!this.captureForFile) return;
    const now = new Date(deterministicNow());
    const date = now.toISOString().slice(0, 10);
    const time = now.toTimeString().slice(0, 8);
    const entry = `[${date} ${time}] [${level}] ${stripAnsi(msg)}`;
    this.entries.push(entry);
    if (this.logFile) {
      this.writeLogEntry(entry + '\n');
    }
  }

  private writeLogEntry(line: string): void {
    if (!this.logFile) return;
    const buf = Buffer.from(line);
    this.ensureLogFileOpen(buf.length);
    let offset = 0;
    while (offset < buf.length) {
      const written = writeSync(this.logFd!, buf, offset, buf.length - offset);
      offset += written;
    }
    this.logBytes += buf.length;
  }

  private ensureLogFileOpen(nextWriteBytes: number): void {
    if (!this.logFile) return;
    if (this.logFd === undefined) {
      this.logBytes = this.currentLogFileSize();
      if (this.shouldRotate(nextWriteBytes)) {
        this.truncateOrRotate();
      }
      this.logFd = openSync(this.logFile, 'a');
      return;
    }

    if (this.shouldRotate(nextWriteBytes)) {
      this.close();
      this.truncateOrRotate();
      this.logFd = openSync(this.logFile, 'a');
    }
  }

  /**
   * Rotate log files when retention is enabled, or truncate the active file
   * when retention is disabled (maxRotatedLogFiles < 1). Always resets logBytes
   * to 0 only after the file has actually been emptied or replaced.
   */
  private truncateOrRotate(): void {
    if (this.maxRotatedLogFiles < 1) {
      // Retention disabled: truncate the active file in-place to enforce the size cap.
      if (this.logFile && existsSync(this.logFile)) {
        truncateSync(this.logFile, 0);
      }
    } else {
      this.rotateLogFiles();
    }
    this.logBytes = 0;
  }

  private shouldRotate(nextWriteBytes: number): boolean {
    return this.maxLogFileBytes > 0
      && this.logBytes > 0
      && this.logBytes + nextWriteBytes > this.maxLogFileBytes;
  }

  private currentLogFileSize(): number {
    if (!this.logFile || !existsSync(this.logFile)) return 0;
    return statSync(this.logFile).size;
  }

  private rotateLogFiles(): void {
    if (!this.logFile || this.maxRotatedLogFiles < 1 || !existsSync(this.logFile)) return;

    for (let index = this.maxRotatedLogFiles - 1; index >= 1; index -= 1) {
      const from = `${this.logFile}.${index}`;
      const to = `${this.logFile}.${index + 1}`;
      if (existsSync(from)) {
        renameSync(from, to);
      }
    }

    renameSync(this.logFile, `${this.logFile}.1`);
  }

  private withData(msg: string, data: unknown): string {
    const safeMsg = this.redactMessage(msg);
    if (data === undefined) return safeMsg;
    if (isCommandFailure(data)) {
      return `${safeMsg} | ${this.redactMessage(data.summary)}`;
    }
    return `${safeMsg} | ${safeStringify(data, this.redactSecrets)}`;
  }

  private withBadgeAndData(msg: string, data: unknown, source: string | undefined): string {
    const badge = source ? `[${source}] ` : '';
    const safeMsg = this.redactMessage(msg);
    const body = data !== undefined ? `${safeMsg} | ${safePrettyStringify(data, this.redactSecrets)}` : safeMsg;
    return `${badge}${body}`;
  }

  private redactMessage(msg: string): string {
    return this.redactSecrets ? redactSensitiveText(msg) : msg;
  }
}

export { A as ANSI };

function safeStringify(value: unknown, redactSecrets = true): string {
  try {
    const safeValue = redactSecrets ? redactLogData(value) : value;
    return JSON.stringify(safeValue, (_key, v) => typeof v === 'bigint' ? v.toString() : v);
  } catch {
    return redactSecrets ? redactSensitiveText(String(value)) : String(value);
  }
}

/** Pretty-print for build.log — truncates long string values to keep logs readable. */
function safePrettyStringify(value: unknown, redactSecrets = true): string {
  const MAX_STRING_LEN = 200;
  try {
    const safeValue = redactSecrets ? redactLogData(value) : value;
    const pretty = JSON.stringify(safeValue, (_key, v) => {
      if (typeof v === 'bigint') return v.toString();
      if (typeof v === 'string' && v.length > MAX_STRING_LEN) {
        return v.slice(0, MAX_STRING_LEN) + `... (${v.length} chars)`;
      }
      return v;
    }, 2);
    return pretty;
  } catch {
    return redactSecrets ? redactSensitiveText(String(value)) : String(value);
  }
}

function formatCompact(data: unknown, redactSecrets = true): string {
  const safeData = redactSecrets ? redactLogData(data) : data;
  if (typeof safeData !== 'object' || safeData === null || Array.isArray(safeData)) {
    return safeStringify(safeData, redactSecrets);
  }
  const entries = Object.entries(safeData as Record<string, unknown>);
  if (entries.length === 0) return '';
  return entries.map(([k, v]) => `${k}=${typeof v === 'string' ? v : safeStringify(v, redactSecrets)}`).join(' ');
}
