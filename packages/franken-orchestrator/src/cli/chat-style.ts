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
  return `\n${ANSI.magenta}${CHAT_GLYPHS.beast}${ANSI.reset} ${ANSI.bold}${title}${ANSI.reset} ${ANSI.dim}${meta}${ANSI.reset}\n`;
}
