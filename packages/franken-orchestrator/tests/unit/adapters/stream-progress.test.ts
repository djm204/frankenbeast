import { describe, it, expect, vi } from 'vitest';
import { createStreamProgressHandler } from '../../../src/adapters/stream-progress.js';

describe('createStreamProgressHandler', () => {
  it('shows "Thinking..." on first thinking content_block_start', () => {
    const lines: string[] = [];
    const handler = createStreamProgressHandler((t) => lines.push(t));

    handler(JSON.stringify({
      type: 'content_block_start',
      content_block: { type: 'thinking', thinking: '' },
    }));

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Thinking...');
  });

  it('only shows "Thinking..." once', () => {
    const lines: string[] = [];
    const handler = createStreamProgressHandler((t) => lines.push(t));

    handler(JSON.stringify({
      type: 'content_block_start',
      content_block: { type: 'thinking', thinking: '' },
    }));
    handler(JSON.stringify({
      type: 'content_block_start',
      content_block: { type: 'thinking', thinking: '' },
    }));

    const thinkingLines = lines.filter(l => l.includes('Thinking...'));
    expect(thinkingLines).toHaveLength(1);
  });

  it('shows file path for Write tool_use', () => {
    const lines: string[] = [];
    const handler = createStreamProgressHandler((t) => lines.push(t));

    // Start a tool_use block
    handler(JSON.stringify({
      type: 'content_block_start',
      content_block: { type: 'tool_use', id: 'toolu_1', name: 'Write', input: {} },
    }));

    // Delta with file_path
    handler(JSON.stringify({
      type: 'content_block_delta',
      delta: { type: 'input_json_delta', partial_json: '{"file_path": "/home/user/project/src/foo.ts"' },
    }));

    const writeLines = lines.filter(l => l.includes('Writing'));
    expect(writeLines).toHaveLength(1);
    expect(writeLines[0]).toContain('foo.ts');
  });

  it('shows completion stats on result event', () => {
    const lines: string[] = [];
    const handler = createStreamProgressHandler((t) => lines.push(t));

    handler(JSON.stringify({
      type: 'result',
      subtype: 'success',
      cost_usd: 0.0523,
      duration_ms: 15200,
    }));

    const resultLines = lines.filter(l => l.includes('Completed'));
    expect(resultLines).toHaveLength(1);
    expect(resultLines[0]).toContain('15.2s');
    expect(resultLines[0]).toContain('$0.0523');
  });

  it('skips hookSpecificOutput objects', () => {
    const lines: string[] = [];
    const handler = createStreamProgressHandler((t) => lines.push(t));

    handler(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'SessionStart' },
    }));

    expect(lines).toHaveLength(0);
  });

  it('skips non-JSON lines', () => {
    const lines: string[] = [];
    const handler = createStreamProgressHandler((t) => lines.push(t));

    handler('not json at all');
    expect(lines).toHaveLength(0);
  });

  it('shortens long file paths', () => {
    const lines: string[] = [];
    const handler = createStreamProgressHandler((t) => lines.push(t));

    handler(JSON.stringify({
      type: 'content_block_start',
      content_block: { type: 'tool_use', id: 'toolu_1', name: 'Edit', input: {} },
    }));

    handler(JSON.stringify({
      type: 'content_block_delta',
      delta: { type: 'input_json_delta', partial_json: '{"file_path": "/home/user/project/packages/franken-orchestrator/src/deep/nested/file.ts"' },
    }));

    const editLines = lines.filter(l => l.includes('Editing'));
    expect(editLines).toHaveLength(1);
    expect(editLines[0]).toContain('.../deep/nested/file.ts');
  });
});
