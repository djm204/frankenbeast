/**
 * BeastLogger — Reusable color-coded logger for FRANKENBEAST CLI.
 *
 * Uses raw ANSI escape codes (no external dependencies).
 * Provides formatted log levels, budget bars, status badges,
 * boxed headers, and service highlighting for verbose mode.
 */

import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
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

export function shouldRenderGraphicBanner(options: {
  logoExists: boolean;
  forcePlainBanner?: boolean | undefined;
}): boolean {
  if (!options.logoExists) {
    return false;
  }

  if (options.forcePlainBanner) {
    return false;
  }

  return true;
}

export async function renderBanner(root: string): Promise<string> {
  const version = readBannerVersion(root);
  const fallback = buildFallbackBanner(version);
  const logoPath = resolve(root, 'assets', 'img', 'frankenbeast-github-logo-478x72.png');
  const renderGraphic = shouldRenderGraphicBanner({
    logoExists: existsSync(logoPath),
    forcePlainBanner: process.env.FRANKENBEAST_PLAIN_BANNER === '1',
  });

  if (!renderGraphic) {
    return fallback;
  }

  try {
    const columns = process.stdout.columns ?? 100;
    const width = Math.max(28, Math.min(Math.floor(columns * 0.55), 44));
    const pipeline = sharp(logoPath)
      .ensureAlpha()
      .resize({ width, fit: 'inside' });
    const metadata = await pipeline.metadata();

    if (!metadata.width || !metadata.height) {
      return fallback;
    }

    const { data, info } = await pipeline
      .raw()
      .toBuffer({ resolveWithObject: true });

    const lines: string[] = [];
    const stride = info.channels;
    const pixelAt = (x: number, y: number): [number, number, number, number] => {
      if (y >= info.height) return [0, 0, 0, 0];
      const index = (y * info.width + x) * stride;
      return [
        data[index] ?? 0,
        data[index + 1] ?? 0,
        data[index + 2] ?? 0,
        data[index + 3] ?? 0,
      ];
    };

    for (let y = 0; y < info.height; y += 2) {
      let line = '';
      let hasInk = false;

      for (let x = 0; x < info.width; x += 1) {
        const [r1, g1, b1, a1] = pixelAt(x, y);
        const [r2, g2, b2, a2] = pixelAt(x, y + 1);

        if (a1 < 18 && a2 < 18) {
          line += ' ';
          continue;
        }

        hasInk = true;
        const fg = a1 < 18 ? '39' : `38;2;${r1};${g1};${b1}`;
        const bg = a2 < 18 ? '49' : `48;2;${r2};${g2};${b2}`;
        line += `\x1b[${fg};${bg}m▀`;
      }

      if (hasInk) {
        lines.push(`${line}${A.reset}`);
      }
    }

    if (lines.length === 0) {
      return fallback;
    }

    const contentWidth = Math.max(...lines.map((line) => stripAnsi(line).length));
    const title = centerAnsi(`${A.green}${A.bold}🧟 FRANKENBEAST${A.reset}`, contentWidth);
    const versionLine = centerAnsi(`${A.gray}v${version}${A.reset}`, contentWidth);
    return `\n${lines.join('\n')}\n\n${title} | ${versionLine}\n`;
  } catch {
    return fallback;
  }
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

function buildFallbackBanner(version: string): string {
  const title = `${A.green}${A.bold}FRANKENBEAST${A.reset}`;
  const versionLine = `${A.gray}v${version}${A.reset}`;
  return `${BANNER}${centerAnsi(title, 104)}\n${centerAnsi(versionLine, 104)}\n`;
}

function readBannerVersion(root: string): string {
  const packageJsonPath = resolve(root, 'package.json');
  if (!existsSync(packageJsonPath)) {
    return 'dev';
  }

  try {
    const raw = readFileSync(packageJsonPath, 'utf8');
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === 'string' && parsed.version.length > 0 ? parsed.version : 'dev';
  } catch {
    return 'dev';
  }
}

function centerAnsi(text: string, width: number): string {
  const visibleWidth = stripAnsi(text).length;
  const leftPad = Math.max(0, Math.floor((width - visibleWidth) / 2));
  return `${' '.repeat(leftPad)}${text}`;
}

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
