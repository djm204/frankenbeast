import { describe, it, expect } from 'vitest';
import { CHAT_COLOR, CHAT_GLYPHS, chatBanner, chatBlock, statusRule } from '../../../src/cli/chat-style.js';

function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('CHAT_COLOR', () => {
  it('assigns distinct colors to the user and beast roles', () => {
    expect(CHAT_COLOR.user).not.toBe(CHAT_COLOR.beast);
  });
});

describe('chatBanner / chatBlock', () => {
  it('renders the beast banner with the beast color and glyph', () => {
    const banner = chatBanner('frankenbeast', '· hello');
    expect(banner).toContain(CHAT_COLOR.beast);
    expect(banner).toContain(CHAT_GLYPHS.beast);
    expect(stripAnsi(banner)).toContain('frankenbeast');
    expect(stripAnsi(banner)).toContain('· hello');
  });

  it('indents multi-line block content under the glyph', () => {
    const block = chatBlock(CHAT_GLYPHS.beast, CHAT_COLOR.beast, 'line one\nline two');
    const stripped = stripAnsi(block);
    expect(stripped.split('\n')).toEqual(['✦ line one', '  line two']);
  });
});

describe('statusRule', () => {
  const base = { compactions: 0, sessionDurationMs: 65_000, modelLabel: 'claude-sonnet-4-6' };

  it('includes the model label and session duration', () => {
    const line = stripAnsi(statusRule(80, base));
    expect(line).toContain('claude-sonnet-4-6');
    expect(line).toContain('session 1m 5s');
  });

  it('shows a context percentage and fill bar when contextMaxTokens is known', () => {
    const line = stripAnsi(statusRule(80, {
      ...base,
      usage: { inputTokens: 8000, outputTokens: 2000, totalTokens: 10_000 },
      contextMaxTokens: 20_000,
    }));
    expect(line).toContain('ctx');
    expect(line).toContain('50%');
    expect(line).toContain('10k/20k');
  });

  it('falls back to a bare token count when contextMaxTokens is unknown', () => {
    const line = stripAnsi(statusRule(80, {
      ...base,
      usage: { inputTokens: 800, outputTokens: 200, totalTokens: 1000 },
    }));
    expect(line).toContain('1.0k tok');
    expect(line).not.toContain('ctx');
  });

  it('omits the usage segment entirely when there is no usage yet', () => {
    const line = stripAnsi(statusRule(80, base));
    expect(line).not.toContain('tok');
    expect(line).not.toContain('ctx');
  });

  it('shows compactions only when at least one has occurred', () => {
    const withNone = stripAnsi(statusRule(80, base));
    expect(withNone).not.toContain('compactions');

    const withSome = stripAnsi(statusRule(80, { ...base, compactions: 2 }));
    expect(withSome).toContain('compactions 2');
  });

  it('fills the rest of the line with dashes up to the given column width', () => {
    const line = stripAnsi(statusRule(40, base));
    expect(line.length).toBeLessThanOrEqual(41);
    expect(line.endsWith('─')).toBe(true);
  });
});
