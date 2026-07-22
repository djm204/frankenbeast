import type { TokenUsage } from '@franken/types';
import { ANSI } from '../logging/beast-logger.js';

/**
 * Shared glyph vocabulary for the CLI chat surfaces (local REPL and managed
 * attach), mirroring the agent-CLI convention: a prompt marker for the user,
 * a star for the beast, and distinct markers per event kind.
 */
export const CHAT_GLYPHS = {
  beast: '✦',
  user: '❯',
  plan: '◆',
  execution: '▸',
  status: '·',
  approval: '⚠',
  clarify: '?',
  error: '✗',
  session: '●',
} as const;

/**
 * Role colors: purple for the user, green for frankenbeast. Accessors use the
 * shared ANSI proxy's reset value as the plain-output signal. This avoids a
 * separate eager color-mode snapshot and remains compatible with partial
 * logger mocks used by CLI tests.
 */
export const CHAT_COLOR = {
  get user(): string { return ANSI.reset ? '\x1b[38;5;141m' : ''; },
  get beast(): string { return ANSI.reset ? '\x1b[32m' : ''; },
} as const;

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

function fmtK(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
}

function fmtDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function contextBar(pct: number, width = 10): string {
  const filled = Math.round((Math.max(0, Math.min(100, pct)) / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

export interface ChatUsageSnapshot {
  /** Cumulative token usage across the session so far, if any turn reported real usage. */
  usage?: TokenUsage;
  /** Provider's declared context window; omitted (e.g. managed-attach) collapses to a bare token count. */
  contextMaxTokens?: number;
  compactions: number;
  sessionDurationMs: number;
  modelLabel: string;
}

/**
 * Builds one `─`-filled status rule carrying model, context usage,
 * session duration, and compaction count — the CLI's equivalent of the
 * agent-CLIs' live status bar. Printed once per turn (not continuously
 * reactive: this is a plain readline REPL, not a redrawing TUI), so the
 * numbers reflect state as of when it's printed.
 */
export function statusRule(cols: number, snapshot: ChatUsageSnapshot): string {
  const segments: string[] = [snapshot.modelLabel];
  const usage = snapshot.usage;

  if (usage && snapshot.contextMaxTokens) {
    const pct = Math.min(100, Math.round((usage.totalTokens / snapshot.contextMaxTokens) * 100));
    const barColor = pct >= 95 ? ANSI.red : pct > 80 ? ANSI.red : pct >= 50 ? ANSI.yellow : ANSI.green;
    segments.push(
      `ctx ${barColor}[${contextBar(pct)}]${ANSI.reset}${ANSI.dim} ${pct}% `
      + `(${fmtK(usage.totalTokens)}/${fmtK(snapshot.contextMaxTokens)})`,
    );
  } else if (usage && usage.totalTokens > 0) {
    segments.push(`${fmtK(usage.totalTokens)} tok`);
  }

  segments.push(`session ${fmtDuration(snapshot.sessionDurationMs)}`);
  if (snapshot.compactions > 0) {
    segments.push(`compactions ${snapshot.compactions}`);
  }

  const label = `${ANSI.dim}${segments.join(` ${ANSI.reset}${ANSI.dim}·${ANSI.reset}${ANSI.dim} `)}${ANSI.reset}`;
  const width = Math.max(20, cols || 80);
  const prefix = `${ANSI.dim}── ${ANSI.reset}`;
  const usedWidth = stripAnsi(prefix).length + stripAnsi(label).length + 1;
  const fillWidth = Math.max(0, width - usedWidth);
  const suffix = fillWidth > 0 ? ` ${ANSI.dim}${'─'.repeat(fillWidth)}${ANSI.reset}` : '';

  return `${prefix}${label}${suffix}`;
}

/**
 * Renders a glyph-prefixed block. The glyph takes `glyphColor`; continuation
 * lines are indented two spaces to align under the content column, so
 * multi-line replies read as one visual turn.
 */
export function chatBlock(glyph: string, glyphColor: string, content: string, contentColor = ''): string {
  const reset = contentColor ? ANSI.reset : '';
  const [first = '', ...rest] = content.split('\n');
  const head = `${glyphColor}${glyph}${ANSI.reset} ${contentColor}${first}${reset}`;
  if (rest.length === 0) return head;
  const tail = rest.map((line) => `${contentColor}  ${line}${reset}`).join('\n');
  return `${head}\n${tail}`;
}

/** Dim `└`-anchored metadata line rendered under a turn (tier, timing, cost). */
export function chatStatusLine(text: string): string {
  return `${ANSI.dim}  └ ${text}${ANSI.reset}`;
}

/** One-line session banner: `✦ <title> <dim meta>`. */
export function chatBanner(title: string, meta: string): string {
  return `\n${CHAT_COLOR.beast}${CHAT_GLYPHS.beast}${ANSI.reset} ${ANSI.bold}${title}${ANSI.reset} ${ANSI.dim}${meta}${ANSI.reset}\n`;
}
