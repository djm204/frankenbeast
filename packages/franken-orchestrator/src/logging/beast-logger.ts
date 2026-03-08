/**
 * BeastLogger — Reusable color-coded logger for FRANKENBEAST CLI.
 *
 * Uses raw ANSI escape codes (no external dependencies).
 * Provides formatted log levels, budget bars, status badges,
 * boxed headers, and service highlighting for verbose mode.
 */

import { appendFileSync } from 'node:fs';
import type { ILogger } from '../deps.js';

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
  // eslint-disable-next-line no-control-regex
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
export function statusBadge(pass: boolean): string {
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

export const BANNER = `\n${A.green}${A.bold}` +
  '######## ########     ###    ##    ## ##    ## ######## ##    ## ########  ########    ###     ######  ########\n' +
  '##       ##     ##   ## ##   ###   ## ##   ##  ##       ###   ## ##     ## ##         ## ##   ##    ##    ##\n' +
  '##       ##     ##  ##   ##  ####  ## ##  ##   ##       ####  ## ##     ## ##        ##   ##  ##          ##\n' +
  '######   ########  ##     ## ## ## ## #####    ######   ## ## ## ########  ######   ##     ##  ######     ##\n' +
  '##       ##   ##   ######### ##  #### ##  ##   ##       ##  #### ##     ## ##       #########       ##    ##\n' +
  '##       ##    ##  ##     ## ##   ### ##   ##  ##       ##   ### ##     ## ##       ##     ## ##    ##    ##\n' +
  '##       ##     ## ##     ## ##    ## ##    ## ######## ##    ## ########  ######## ##     ##  ######     ##\n' +
  `${A.reset}\n`;

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
  /** When set, log entries are appended to this file immediately (crash-safe). */
  readonly logFile?: string | undefined;
}

export class BeastLogger implements ILogger {
  private readonly verbose: boolean;
  private readonly captureForFile: boolean;
  private readonly logFile: string | undefined;
  private readonly entries: string[] = [];

  constructor(options: BeastLoggerOptions) {
    this.verbose = options.verbose;
    this.captureForFile = options.captureForFile ?? false;
    this.logFile = options.logFile;
  }

  info(msg: string, dataOrSource?: unknown, source?: string): void {
    const { data, source: src } = resolveArgs(dataOrSource, source);
    const ts = this.timestamp();
    const badge = src ? formatBadge(src) : '';
    const display = data !== undefined ? `${msg}  ${formatCompact(data)}` : msg;
    console.log(`${ts} ${A.cyan}${A.bold} INFO${A.reset} ${badge}${display}`);
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
    console.log(`${ts} ${A.gray}DEBUG ${badge}${highlighted}${A.reset}`);
  }

  warn(msg: string, dataOrSource?: unknown, source?: string): void {
    const { data, source: src } = resolveArgs(dataOrSource, source);
    const ts = this.timestamp();
    const badge = src ? formatBadge(src) : '';
    const display = data !== undefined ? `${msg}  ${formatCompact(data)}` : msg;
    console.log(`${ts} ${A.yellow}${A.bold} WARN${A.reset} ${badge}${A.yellow}${display}${A.reset}`);
    this.capture('WARN', this.withBadgeAndData(msg, data, src));
  }

  error(msg: string, dataOrSource?: unknown, source?: string): void {
    const { data, source: src } = resolveArgs(dataOrSource, source);
    const ts = this.timestamp();
    const badge = src ? formatBadge(src) : '';
    const line = this.withData(msg, data);
    console.log(`${ts} ${A.red}${A.bold}ERROR${A.reset} ${badge}${A.red}${line}${A.reset}`);
    this.capture('ERROR', this.withBadgeAndData(msg, data, src));
  }

  /** Get captured log entries for writing to a plain-text log file. */
  getLogEntries(): string[] {
    return [...this.entries];
  }

  private timestamp(): string {
    return `${A.gray}${new Date().toTimeString().slice(0, 8)}${A.reset}`;
  }

  private capture(level: string, msg: string): void {
    if (!this.captureForFile) return;
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const time = now.toTimeString().slice(0, 8);
    const entry = `[${date} ${time}] [${level}] ${stripAnsi(msg)}`;
    this.entries.push(entry);
    if (this.logFile) {
      appendFileSync(this.logFile, entry + '\n');
    }
  }

  private withData(msg: string, data: unknown): string {
    if (data === undefined) return msg;
    return `${msg} | ${safeStringify(data)}`;
  }

  private withBadgeAndData(msg: string, data: unknown, source: string | undefined): string {
    const badge = source ? `[${source}] ` : '';
    const body = data !== undefined ? `${msg} | ${safePrettyStringify(data)}` : msg;
    return `${badge}${body}`;
  }
}

export { A as ANSI };

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, (_key, v) => typeof v === 'bigint' ? v.toString() : v);
  } catch {
    return String(value);
  }
}

/** Pretty-print for build.log — truncates long string values to keep logs readable. */
function safePrettyStringify(value: unknown): string {
  const MAX_STRING_LEN = 200;
  try {
    const pretty = JSON.stringify(value, (_key, v) => {
      if (typeof v === 'bigint') return v.toString();
      if (typeof v === 'string' && v.length > MAX_STRING_LEN) {
        return v.slice(0, MAX_STRING_LEN) + `... (${v.length} chars)`;
      }
      return v;
    }, 2);
    return pretty;
  } catch {
    return String(value);
  }
}

function formatCompact(data: unknown): string {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return safeStringify(data);
  }
  const entries = Object.entries(data as Record<string, unknown>);
  if (entries.length === 0) return '';
  return entries.map(([k, v]) => `${k}=${typeof v === 'string' ? v : safeStringify(v)}`).join(' ');
}
