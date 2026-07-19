import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createStreamProgressHandler, createStreamProgressWithSpinner } from '../../../src/adapters/stream-progress.js';
import type { NormalizedProviderStreamEvent } from '../../../src/adapters/stream-progress.js';

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

  it('accumulates split input JSON deltas before showing a tool file path once', () => {
    const lines: string[] = [];
    const handler = createStreamProgressHandler((t) => lines.push(t));

    handler(JSON.stringify({
      type: 'content_block_start',
      content_block: { type: 'tool_use', id: 'toolu_1', name: 'Write', input: {} },
    }));

    handler(JSON.stringify({
      type: 'content_block_delta',
      delta: { type: 'input_json_delta', partial_json: '{"file_' },
    }));
    handler(JSON.stringify({
      type: 'content_block_delta',
      delta: { type: 'input_json_delta', partial_json: 'path": "/home/user/project/src/split.ts"' },
    }));
    handler(JSON.stringify({
      type: 'content_block_delta',
      delta: { type: 'input_json_delta', partial_json: ', "content": "extra"}' },
    }));

    const writeLines = lines.filter(l => l.includes('Writing'));
    expect(writeLines).toHaveLength(1);
    expect(writeLines[0]).toContain('split.ts');
  });

  it('resets split input JSON buffering between tool uses', () => {
    const lines: string[] = [];
    const handler = createStreamProgressHandler((t) => lines.push(t));

    handler(JSON.stringify({
      type: 'content_block_start',
      content_block: { type: 'tool_use', id: 'toolu_1', name: 'Write', input: {} },
    }));
    handler(JSON.stringify({
      type: 'content_block_delta',
      delta: { type: 'input_json_delta', partial_json: '{"file_' },
    }));

    handler(JSON.stringify({
      type: 'content_block_start',
      content_block: { type: 'tool_use', id: 'toolu_2', name: 'Edit', input: {} },
    }));
    handler(JSON.stringify({
      type: 'content_block_delta',
      delta: { type: 'input_json_delta', partial_json: 'path": "/home/user/project/src/leaked.ts"' },
    }));

    expect(lines.filter(l => l.includes('Writing') || l.includes('Editing'))).toHaveLength(0);
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

  it('normalizes a captured Claude assistant frame without exposing reasoning text', () => {
    const lines: string[] = [];
    const events: Array<{ type: string }> = [];
    const handler = createStreamProgressHandler((t) => lines.push(t), {
      onEvent: (event) => events.push(event),
    });

    handler(JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          { type: 'thinking', thinking: 'private chain of thought' },
          { type: 'tool_use', id: 'tool-1', name: 'Read', input: { file_path: '/workspace/src/plan.ts' } },
          { type: 'text', text: '[{"id":"implement-stream-events"}]' },
        ],
        usage: { input_tokens: 120, output_tokens: 30 },
      },
    }));

    expect(events.map((event) => event.type)).toEqual(['usage', 'reasoning', 'tool', 'text']);
    expect(lines.some((line) => line.includes('Reasoning...'))).toBe(true);
    expect(lines.some((line) => line.includes('Reading') && line.includes('plan.ts'))).toBe(true);
    expect(lines.some((line) => line.includes('Planned chunk:') && line.includes('implement-stream-events'))).toBe(true);
    expect(lines.join('')).not.toContain('private chain of thought');
  });

  it('normalizes captured Codex item and turn frames', () => {
    const lines: string[] = [];
    const events: Array<{ type: string }> = [];
    const handler = createStreamProgressHandler((t) => lines.push(t), {
      onEvent: (event) => events.push(event),
    });

    handler(JSON.stringify({ type: 'item.started', item: { type: 'reasoning', text: 'private reasoning' } }));
    handler(JSON.stringify({
      type: 'item.completed',
      item: { type: 'command_execution', command: 'npm test', status: 'completed' },
    }));
    handler(JSON.stringify({
      type: 'item.completed',
      item: { type: 'agent_message', text: '[{"id":"codex-plan"}]' },
    }));
    handler(JSON.stringify({
      type: 'turn.completed',
      usage: { input_tokens: 80, output_tokens: 20 },
    }));

    expect(events.map((event) => event.type)).toEqual(['reasoning', 'tool', 'text', 'usage', 'result']);
    expect(lines.some((line) => line.includes('Reasoning...'))).toBe(true);
    expect(lines.some((line) => line.includes('Running'))).toBe(true);
    expect(lines.some((line) => line.includes('codex-plan'))).toBe(true);
    expect(lines.join('')).not.toContain('private reasoning');
    expect(lines.join('')).not.toContain('npm test');
  });

  it('normalizes captured Gemini message, tool, and result frames', () => {
    const lines: string[] = [];
    const events: Array<{ type: string }> = [];
    const handler = createStreamProgressHandler((t) => lines.push(t), {
      onEvent: (event) => events.push(event),
    });

    handler(JSON.stringify({
      type: 'message',
      role: 'assistant',
      content: '[{"id":"gemini-plan"}]',
      delta: true,
    }));
    handler(JSON.stringify({
      type: 'tool_use',
      tool_name: 'read_file',
      tool_id: 'read-1',
      parameters: { file_path: '/workspace/src/gemini.ts' },
    }));
    handler(JSON.stringify({
      type: 'result',
      status: 'success',
      stats: { input_tokens: 45, output_tokens: 15, duration_ms: 2500 },
    }));

    expect(events.map((event) => event.type)).toEqual(['text', 'tool', 'usage', 'result']);
    expect(lines.some((line) => line.includes('gemini-plan'))).toBe(true);
    expect(lines.some((line) => line.includes('Using read_file:') && line.includes('gemini.ts'))).toBe(true);
    expect(lines.some((line) => line.includes('LLM done') && line.includes('2.5s'))).toBe(true);
  });

  it('redacts tool payloads from normalized events', () => {
    const events: NormalizedProviderStreamEvent[] = [];
    const handler = createStreamProgressHandler(() => {}, {
      onEvent: (event) => events.push(event),
    });

    handler(JSON.stringify({
      type: 'assistant',
      message: {
        content: [{
          type: 'tool_use',
          name: 'Write',
          input: { file_path: '/workspace/safe.ts', content: 'sensitive file contents' },
        }],
      },
    }));

    expect(events).toEqual([{ type: 'tool', name: 'Write', path: '/workspace/safe.ts' }]);
    expect(JSON.stringify(events)).not.toContain('sensitive file contents');
  });

  it('normalizes nested Gemini messages, result text, and Gemini token fields', () => {
    const lines: string[] = [];
    const events: NormalizedProviderStreamEvent[] = [];
    const handler = createStreamProgressHandler((line) => lines.push(line), {
      onEvent: (event) => events.push(event),
    });

    handler(JSON.stringify({
      type: 'message',
      message: { role: 'assistant', content: [{ text: '[{"id":"nested-gemini"}]' }] },
    }));
    handler(JSON.stringify({
      type: 'result',
      result: '[{"id":"result-gemini"}]',
      stats: { promptTokenCount: 21, candidatesTokenCount: 8 },
    }));

    expect(events.map((event) => event.type)).toEqual(['text', 'usage', 'text', 'result']);
    expect(events[1]).toEqual({ type: 'usage', inputTokens: 21, outputTokens: 8, totalTokens: 29 });
    expect(lines.some((line) => line.includes('nested-gemini'))).toBe(true);
    expect(lines.some((line) => line.includes('result-gemini'))).toBe(true);
  });

  it('preserves message lifecycle usage and untyped text deltas', () => {
    const lines: string[] = [];
    const events: NormalizedProviderStreamEvent[] = [];
    const handler = createStreamProgressHandler((line) => lines.push(line), {
      onEvent: (event) => events.push(event),
    });

    handler(JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 13 } } }));
    handler(JSON.stringify({ type: 'message_delta', usage: { output_tokens: 5 } }));
    handler(JSON.stringify({ type: 'content_block_delta', delta: { text: '[{"id":"untyped-delta"}]' } }));

    expect(events.map((event) => event.type)).toEqual(['usage', 'usage', 'text']);
    expect(lines.some((line) => line.includes('untyped-delta'))).toBe(true);
  });

  it('extracts safe paths from JSON-string tool arguments', () => {
    const lines: string[] = [];
    const events: NormalizedProviderStreamEvent[] = [];
    const handler = createStreamProgressHandler((line) => lines.push(line), {
      onEvent: (event) => events.push(event),
    });

    handler(JSON.stringify({
      type: 'function_call',
      name: 'read_file',
      arguments: JSON.stringify({ path: '/workspace/src/string-args.ts', secret: 'do not emit' }),
    }));

    expect(events).toEqual([{ type: 'tool', name: 'read_file', path: '/workspace/src/string-args.ts' }]);
    expect(lines.some((line) => line.includes('string-args.ts'))).toBe(true);
    expect(JSON.stringify(events)).not.toContain('do not emit');
  });

  it('reports unknown event types through redacted verbose diagnostics', () => {
    const lines: string[] = [];
    const handler = createStreamProgressHandler((t) => lines.push(t), { verbose: true });

    handler(JSON.stringify({ type: 'provider.secret_frame', content: 'sensitive payload' }));

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Unknown provider stream event: provider.secret_frame');
    expect(lines[0]).not.toContain('sensitive payload');
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
