import { describe, it, expect } from 'vitest';
import { ClaudeProvider } from '../../src/skills/providers/claude-provider.js';

describe('ClaudeProvider.normalizeOutput', () => {
  const provider = new ClaudeProvider();

  it('extracts text from stream-json frames', () => {
    const raw = [
      JSON.stringify({ type: 'content_block_delta', delta: { text: 'Hello' } }),
      JSON.stringify({ type: 'content_block_delta', delta: { text: ' world' } }),
    ].join('\n');

    expect(provider.normalizeOutput(raw)).toBe('Hello\n world');
  });

  it('passes through plain text', () => {
    expect(provider.normalizeOutput('plain text output')).toBe('plain text output');
  });

  it('strips single-line hookSpecificOutput JSON', () => {
    const hookLine = JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: '<EXTREMELY_IMPORTANT>stuff</EXTREMELY_IMPORTANT>',
      },
    });
    const textLine = JSON.stringify({ type: 'content_block_delta', delta: { text: 'actual content' } });
    const raw = hookLine + '\n' + textLine;

    expect(provider.normalizeOutput(raw)).toBe('actual content');
  });

  it('strips multi-line pretty-printed hookSpecificOutput JSON', () => {
    const hookBlock = [
      '{',
      '  "hookSpecificOutput": {',
      '    "hookEventName": "SessionStart",',
      '    "additionalContext": "<EXTREMELY_IMPORTANT>\\nYou have superpowers.\\n</EXTREMELY_IMPORTANT>"',
      '  }',
      '}',
    ].join('\n');
    const textLine = JSON.stringify({ type: 'content_block_delta', delta: { text: 'the real output' } });
    const raw = hookBlock + '\n' + textLine;

    expect(provider.normalizeOutput(raw)).toBe('the real output');
  });

  it('strips hook block with deeply nested content containing braces', () => {
    const hookBlock = [
      '{',
      '  "hookSpecificOutput": {',
      '    "hookEventName": "SessionStart",',
      '    "additionalContext": "function foo() { return { x: 1 }; }"',
      '  }',
      '}',
    ].join('\n');
    const textLine = JSON.stringify({ type: 'content_block_delta', delta: { text: 'clean' } });
    const raw = hookBlock + '\n' + textLine;

    expect(provider.normalizeOutput(raw)).toBe('clean');
  });

  it('strips multiple hook blocks', () => {
    const hook1 = JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: 'a' } });
    const hook2 = JSON.stringify({ hookSpecificOutput: { hookEventName: 'AnotherHook', additionalContext: 'b' } });
    const textLine = JSON.stringify({ type: 'content_block_delta', delta: { text: 'output' } });
    const raw = hook1 + '\n' + hook2 + '\n' + textLine;

    expect(provider.normalizeOutput(raw)).toBe('output');
  });

  it('handles hook block at end of output', () => {
    const textLine = JSON.stringify({ type: 'content_block_delta', delta: { text: 'before' } });
    const hookBlock = [
      '{',
      '  "hookSpecificOutput": {',
      '    "hookEventName": "SessionEnd"',
      '  }',
      '}',
    ].join('\n');
    const raw = textLine + '\n' + hookBlock;

    expect(provider.normalizeOutput(raw)).toBe('before');
  });

  it('handles output that is only hook blocks', () => {
    const hookBlock = [
      '{',
      '  "hookSpecificOutput": {',
      '    "hookEventName": "SessionStart",',
      '    "additionalContext": "stuff"',
      '  }',
      '}',
    ].join('\n');

    expect(provider.normalizeOutput(hookBlock)).toBe('');
  });
});
