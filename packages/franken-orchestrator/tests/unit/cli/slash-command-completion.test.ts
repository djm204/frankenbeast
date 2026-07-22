import { describe, expect, it } from 'vitest';
import {
  CHAT_SLASH_COMMANDS,
  completeSlashCommand,
} from '../../../src/cli/slash-command-completion.js';

describe('slash command completion', () => {
  it('lists every documented command for a bare slash', () => {
    expect(completeSlashCommand('/')).toEqual([
      CHAT_SLASH_COMMANDS.map(({ name }) => name),
      '/',
    ]);
    expect(CHAT_SLASH_COMMANDS.every(({ description }) => description.length > 0)).toBe(true);
  });

  it('narrows prefix matches case-insensitively', () => {
    expect(completeSlashCommand('/P')).toEqual([['/plan'], '/P']);
    expect(completeSlashCommand('/s')).toEqual([['/status', '/session'], '/s']);
    expect(completeSlashCommand('/rej')).toEqual([['/reject'], '/rej']);
  });

  it('falls back to ordered fuzzy matches for mistyped prefixes', () => {
    expect(completeSlashCommand('/stt')).toEqual([['/status'], '/stt']);
    expect(completeSlashCommand('/pln')).toEqual([['/plan'], '/pln']);
  });

  it('does not complete chat text, command arguments, or unknown commands', () => {
    expect(completeSlashCommand('hello')).toEqual([[], 'hello']);
    expect(completeSlashCommand('/run fix tests')).toEqual([[], '/run fix tests']);
    expect(completeSlashCommand('/xyz')).toEqual([[], '/xyz']);
  });
});