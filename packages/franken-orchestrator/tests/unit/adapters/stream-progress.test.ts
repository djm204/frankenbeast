import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createStreamProgressHandler, createStreamProgressWithSpinner } from '../../../src/adapters/stream-progress.js';

describe('createStreamProgressHandler', () => {
  it('shows "Reasoning..." on first thinking content_block_start', () => {
    const lines: string[] = [];
    const handler = createStreamProgressHandler((t) => lines.push(t));

    handler(JSON.stringify({
      type: 'content_block_start',
      content_block: { type: 'thinking', thinking: '' },
    }));

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Reasoning...');
  });

  it('only shows "Reasoning..." once', () => {
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

    const thinkingLines = lines.filter(l => l.includes('Reasoning...'));
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

    const resultLines = lines.filter(l => l.includes('LLM done'));
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

describe('createStreamProgressWithSpinner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns an object with onLine and stop methods', () => {
    const output: string[] = [];
    const handle = createStreamProgressWithSpinner({ write: (t) => output.push(t) });

    expect(typeof handle.onLine).toBe('function');
    expect(typeof handle.stop).toBe('function');

    handle.stop();
  });

  it('renders a spinner immediately on creation', () => {
    const output: string[] = [];
    const handle = createStreamProgressWithSpinner({
      write: (t) => output.push(t),
      label: 'Testing...',
    });

    // Should have rendered the first spinner frame
    const spinnerFrames = output.filter(t => t.includes('Testing...'));
    expect(spinnerFrames.length).toBeGreaterThanOrEqual(1);

    handle.stop();
  });

  it('clears spinner line before writing progress events', () => {
    const output: string[] = [];
    const handle = createStreamProgressWithSpinner({
      write: (t) => output.push(t),
    });

    // Feed a thinking event
    handle.onLine(JSON.stringify({
      type: 'content_block_start',
      content_block: { type: 'thinking', thinking: '' },
    }));

    // Should have: spinner frame, then \r\x1b[K (clear), then "Reasoning..." line
    const clearIdx = output.findIndex(t => t === '\r\x1b[K');
    const reasonIdx = output.findIndex(t => t.includes('Reasoning...'));
    expect(clearIdx).toBeGreaterThan(0); // After initial spinner
    expect(reasonIdx).toBeGreaterThan(clearIdx); // After clear

    handle.stop();
  });

  it('stop() clears the spinner line and prevents further renders', () => {
    const output: string[] = [];
    const handle = createStreamProgressWithSpinner({
      write: (t) => output.push(t),
    });

    handle.stop();
    const countAfterStop = output.length;

    // Advance timers — no new spinner frames should appear
    vi.advanceTimersByTime(500);
    expect(output.length).toBe(countAfterStop);

    // Last write before stop should be a clear
    expect(output[output.length - 1]).toBe('\r\x1b[K');
  });

  it('forwards stream events to the inner handler', () => {
    const output: string[] = [];
    const handle = createStreamProgressWithSpinner({
      write: (t) => output.push(t),
    });

    handle.onLine(JSON.stringify({
      type: 'result',
      subtype: 'success',
      cost_usd: 0.01,
      duration_ms: 5000,
    }));

    const doneLines = output.filter(t => t.includes('LLM done'));
    expect(doneLines).toHaveLength(1);
    expect(doneLines[0]).toContain('5.0s');

    handle.stop();
  });

  it('uses custom label in spinner', () => {
    const output: string[] = [];
    const handle = createStreamProgressWithSpinner({
      write: (t) => output.push(t),
      label: 'Planning...',
    });

    const planningFrames = output.filter(t => t.includes('Planning...'));
    expect(planningFrames.length).toBeGreaterThanOrEqual(1);

    handle.stop();
  });
});
