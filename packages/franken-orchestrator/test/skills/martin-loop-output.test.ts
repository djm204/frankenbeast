import { describe, it, expect } from 'vitest';
import { processStreamLine, StreamLineBuffer } from '../../src/skills/martin-loop.js';
import { formatIterationProgress, writeProgress } from '../../src/skills/cli-skill-executor.js';

// ── processStreamLine ──

describe('processStreamLine', () => {
  it('extracts text from content_block_delta with nested delta.text', () => {
    const line = JSON.stringify({
      type: 'content_block_delta',
      delta: { type: 'text_delta', text: 'Hello world' },
    });
    expect(processStreamLine(line)).toBe('Hello world');
  });

  it('extracts text from multiple nested text fields', () => {
    const line = JSON.stringify({
      type: 'content_block_delta',
      delta: { text: 'chunk1' },
    });
    expect(processStreamLine(line)).toBe('chunk1');
  });

  it('returns empty string for non-text JSON frames (e.g. ping, message_start)', () => {
    const line = JSON.stringify({ type: 'ping' });
    expect(processStreamLine(line)).toBe('');
  });

  it('returns empty string for message_start with no text content', () => {
    const line = JSON.stringify({
      type: 'message_start',
      message: { id: 'msg_123', role: 'assistant', content: [] },
    });
    expect(processStreamLine(line)).toBe('');
  });

  it('passes through plain text lines unchanged', () => {
    expect(processStreamLine('Some plain output text')).toBe('Some plain output text');
  });

  it('passes through non-JSON error messages unchanged', () => {
    expect(processStreamLine('Error: something went wrong')).toBe('Error: something went wrong');
  });

  it('returns empty string for empty/whitespace-only lines', () => {
    expect(processStreamLine('')).toBe('');
    expect(processStreamLine('   ')).toBe('');
  });

  it('extracts thinking content as dimmed text', () => {
    const line = JSON.stringify({
      type: 'content_block_delta',
      delta: { type: 'thinking_delta', thinking: 'Let me think...' },
    });
    const result = processStreamLine(line);
    expect(result).toContain('Let me think...');
    // Should be wrapped in dim ANSI codes
    expect(result).toContain('\x1b[2m');
    expect(result).toContain('\x1b[0m');
  });

  it('handles content_block with nested content array containing text', () => {
    const line = JSON.stringify({
      type: 'message_delta',
      message: {
        content: [{ type: 'text', text: 'final output' }],
      },
    });
    expect(processStreamLine(line)).toBe('final output');
  });

  it('does not extract raw JSON object as text', () => {
    const line = JSON.stringify({
      type: 'content_block_start',
      content_block: { type: 'text', text: '' },
    });
    // Empty text should not be extracted
    expect(processStreamLine(line)).toBe('');
  });
});

// ── StreamLineBuffer ──

describe('StreamLineBuffer', () => {
  it('buffers partial lines until newline is received', () => {
    const buffer = new StreamLineBuffer();
    const result1 = buffer.push('{"type":"content_block_del');
    expect(result1).toEqual([]);

    const result2 = buffer.push('ta","delta":{"text":"hi"}}\n');
    expect(result2).toHaveLength(1);
    expect(result2[0]).toBe('hi');
  });

  it('handles multiple complete lines in one push', () => {
    const buffer = new StreamLineBuffer();
    const lines = [
      JSON.stringify({ type: 'content_block_delta', delta: { text: 'A' } }),
      JSON.stringify({ type: 'content_block_delta', delta: { text: 'B' } }),
    ].join('\n') + '\n';

    const result = buffer.push(lines);
    expect(result).toEqual(['A', 'B']);
  });

  it('handles a mix of complete and partial lines', () => {
    const buffer = new StreamLineBuffer();
    const completeLine = JSON.stringify({ type: 'content_block_delta', delta: { text: 'first' } });
    const partialLine = '{"type":"content_block_del';

    const result1 = buffer.push(completeLine + '\n' + partialLine);
    expect(result1).toEqual(['first']);

    const result2 = buffer.push('ta","delta":{"text":"second"}}\n');
    expect(result2).toEqual(['second']);
  });

  it('passes plain text through unchanged', () => {
    const buffer = new StreamLineBuffer();
    const result = buffer.push('Hello world\n');
    expect(result).toEqual(['Hello world']);
  });

  it('filters out empty results from non-text JSON frames', () => {
    const buffer = new StreamLineBuffer();
    const line = JSON.stringify({ type: 'ping' }) + '\n';
    const result = buffer.push(line);
    expect(result).toEqual([]);
  });

  it('handles data split across three pushes', () => {
    const buffer = new StreamLineBuffer();
    const json = JSON.stringify({ type: 'content_block_delta', delta: { text: 'split' } });
    const third = Math.floor(json.length / 3);

    expect(buffer.push(json.slice(0, third))).toEqual([]);
    expect(buffer.push(json.slice(third, third * 2))).toEqual([]);

    const result = buffer.push(json.slice(third * 2) + '\n');
    expect(result).toEqual(['split']);
  });

  it('flush() returns buffered partial line as plain text', () => {
    const buffer = new StreamLineBuffer();
    buffer.push('partial content without newline');
    const result = buffer.flush();
    expect(result).toEqual(['partial content without newline']);
  });

  it('flush() returns empty array when buffer is empty', () => {
    const buffer = new StreamLineBuffer();
    const result = buffer.flush();
    expect(result).toEqual([]);
  });
});

// ── Garbled stream-json input ──

describe('StreamLineBuffer — garbled stream-json', () => {
  it('filters out all non-text JSON frames from realistic stream sequence', () => {
    const buffer = new StreamLineBuffer();
    const frames = [
      JSON.stringify({ type: 'message_start', message: { id: 'msg_1', role: 'assistant', content: [] } }),
      JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
      JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello' } }),
      JSON.stringify({ type: 'ping' }),
      JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: ' world' } }),
      JSON.stringify({ type: 'content_block_stop', index: 0 }),
      JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn' } }),
      JSON.stringify({ type: 'message_stop' }),
    ].join('\n') + '\n';

    const result = buffer.push(frames);
    // Only text deltas should come through
    expect(result).toEqual(['Hello', ' world']);
    // No raw JSON should leak
    for (const line of result) {
      expect(line).not.toContain('"type"');
      expect(line).not.toContain('content_block_delta');
    }
  });

  it('handles interleaved JSON frames and plain text lines', () => {
    const buffer = new StreamLineBuffer();
    const input = [
      JSON.stringify({ type: 'ping' }),
      'Some plain text output',
      JSON.stringify({ type: 'content_block_delta', delta: { text: 'json text' } }),
      'Another plain line',
      JSON.stringify({ type: 'message_stop' }),
    ].join('\n') + '\n';

    const result = buffer.push(input);
    expect(result).toEqual(['Some plain text output', 'json text', 'Another plain line']);
  });

  it('no raw content_block_delta JSON appears in output', () => {
    const buffer = new StreamLineBuffer();
    // Simulate many different frame types that Claude emits
    const rawFrames = [
      { type: 'message_start', message: { id: 'x', role: 'assistant', content: [] } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'visible' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn', usage: { output_tokens: 42 } } },
      { type: 'message_stop' },
    ];

    const input = rawFrames.map(f => JSON.stringify(f)).join('\n') + '\n';
    const result = buffer.push(input);

    // Only 'visible' text should come through
    expect(result).toEqual(['visible']);
    // Verify none of the raw frames leaked
    const joined = result.join(' ');
    expect(joined).not.toContain('content_block_delta');
    expect(joined).not.toContain('message_start');
    expect(joined).not.toContain('message_stop');
  });
});

// ── StreamLineBuffer — tool use summarization ──

describe('StreamLineBuffer — tool use summarization', () => {
  it('emits dimmed summary for Read tool instead of file contents', () => {
    const buffer = new StreamLineBuffer();
    const frames = [
      JSON.stringify({ type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'tu_1', name: 'Read' } }),
      JSON.stringify({ type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"file_' } }),
      JSON.stringify({ type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: 'path": "/src/foo.ts"}' } }),
      JSON.stringify({ type: 'content_block_stop', index: 1 }),
    ].join('\n') + '\n';

    const result = buffer.push(frames);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('Read');
    expect(result[0]).toContain('foo.ts');
    // Should be dimmed
    expect(result[0]).toContain('\x1b[2m');
  });

  it('emits dimmed summary for Edit tool with file path', () => {
    const buffer = new StreamLineBuffer();
    const frames = [
      JSON.stringify({ type: 'content_block_start', index: 2, content_block: { type: 'tool_use', id: 'tu_2', name: 'Edit' } }),
      JSON.stringify({ type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: '{"file_path": "/src/bar.ts", "old_string": "x", "new_string": "y"}' } }),
      JSON.stringify({ type: 'content_block_stop', index: 2 }),
    ].join('\n') + '\n';

    const result = buffer.push(frames);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('Edit');
    expect(result[0]).toContain('bar.ts');
  });

  it('emits dimmed summary for Write tool with file path', () => {
    const buffer = new StreamLineBuffer();
    const frames = [
      JSON.stringify({ type: 'content_block_start', index: 3, content_block: { type: 'tool_use', id: 'tu_3', name: 'Write' } }),
      JSON.stringify({ type: 'content_block_delta', index: 3, delta: { type: 'input_json_delta', partial_json: '{"file_path": "/src/new-file.ts", "content": "export const x = 1;"}' } }),
      JSON.stringify({ type: 'content_block_stop', index: 3 }),
    ].join('\n') + '\n';

    const result = buffer.push(frames);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('Write');
    expect(result[0]).toContain('new-file.ts');
  });

  it('emits Bash tool summary with truncated command', () => {
    const buffer = new StreamLineBuffer();
    const frames = [
      JSON.stringify({ type: 'content_block_start', index: 4, content_block: { type: 'tool_use', id: 'tu_4', name: 'Bash' } }),
      JSON.stringify({ type: 'content_block_delta', index: 4, delta: { type: 'input_json_delta', partial_json: '{"command": "npm run build"}' } }),
      JSON.stringify({ type: 'content_block_stop', index: 4 }),
    ].join('\n') + '\n';

    const result = buffer.push(frames);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('Bash');
    expect(result[0]).toContain('npm run build');
  });

  it('emits Glob/Grep tool summary with pattern', () => {
    const buffer = new StreamLineBuffer();
    const frames = [
      JSON.stringify({ type: 'content_block_start', index: 5, content_block: { type: 'tool_use', id: 'tu_5', name: 'Glob' } }),
      JSON.stringify({ type: 'content_block_delta', index: 5, delta: { type: 'input_json_delta', partial_json: '{"pattern": "**/*.test.ts"}' } }),
      JSON.stringify({ type: 'content_block_stop', index: 5 }),
    ].join('\n') + '\n';

    const result = buffer.push(frames);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('Glob');
    expect(result[0]).toContain('**/*.test.ts');
  });

  it('suppresses tool_result content blocks', () => {
    const buffer = new StreamLineBuffer();
    const frames = [
      // Tool use start + input + stop
      JSON.stringify({ type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'tu_1', name: 'Read' } }),
      JSON.stringify({ type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"file_path": "/src/foo.ts"}' } }),
      JSON.stringify({ type: 'content_block_stop', index: 1 }),
      // Tool result (the actual file content — should be suppressed)
      JSON.stringify({ type: 'content_block_start', index: 2, content_block: { type: 'tool_result', tool_use_id: 'tu_1' } }),
      JSON.stringify({ type: 'content_block_delta', index: 2, delta: { type: 'text_delta', text: 'export const x = 1;\nexport const y = 2;\n// lots of content...' } }),
      JSON.stringify({ type: 'content_block_stop', index: 2 }),
    ].join('\n') + '\n';

    const result = buffer.push(frames);
    // Should only have the tool summary, not the file content
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('Read');
    expect(result.join('')).not.toContain('export const x');
  });

  it('does not suppress regular text blocks', () => {
    const buffer = new StreamLineBuffer();
    const frames = [
      // Tool use
      JSON.stringify({ type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'tu_1', name: 'Read' } }),
      JSON.stringify({ type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"file_path": "/src/foo.ts"}' } }),
      JSON.stringify({ type: 'content_block_stop', index: 1 }),
      // Regular text (assistant talking)
      JSON.stringify({ type: 'content_block_start', index: 3, content_block: { type: 'text', text: '' } }),
      JSON.stringify({ type: 'content_block_delta', index: 3, delta: { type: 'text_delta', text: 'I found the issue.' } }),
      JSON.stringify({ type: 'content_block_stop', index: 3 }),
    ].join('\n') + '\n';

    const result = buffer.push(frames);
    expect(result).toContain('I found the issue.');
  });

  it('handles unknown tool names gracefully', () => {
    const buffer = new StreamLineBuffer();
    const frames = [
      JSON.stringify({ type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'tu_1', name: 'SomeNewTool' } }),
      JSON.stringify({ type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"foo": "bar"}' } }),
      JSON.stringify({ type: 'content_block_stop', index: 1 }),
    ].join('\n') + '\n';

    const result = buffer.push(frames);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('SomeNewTool');
  });

  it('handles partial JSON across multiple pushes', () => {
    const buffer = new StreamLineBuffer();

    // First push: tool_use start
    const r1 = buffer.push(
      JSON.stringify({ type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'tu_1', name: 'Read' } }) + '\n'
    );
    expect(r1).toEqual([]);

    // Second push: input delta
    const r2 = buffer.push(
      JSON.stringify({ type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"file_path": "/src/x.ts"}' } }) + '\n'
    );
    expect(r2).toEqual([]);

    // Third push: stop
    const r3 = buffer.push(
      JSON.stringify({ type: 'content_block_stop', index: 1 }) + '\n'
    );
    expect(r3).toHaveLength(1);
    expect(r3[0]).toContain('Read');
    expect(r3[0]).toContain('x.ts');
  });
});

// ── formatIterationProgress ──

describe('formatIterationProgress', () => {
  it('formats progress line with all fields', () => {
    const line = formatIterationProgress({
      chunkId: '04_observer',
      iteration: 3,
      maxIterations: 30,
      durationMs: 45_000,
      tokensEstimated: 1200,
    });
    expect(line).toBe('[martin] Iteration 3/30 | chunk: 04_observer | 45s elapsed | ~1,200 tokens');
  });

  it('formats progress without optional duration and tokens', () => {
    const line = formatIterationProgress({
      chunkId: 'my-chunk',
      iteration: 1,
      maxIterations: 10,
    });
    expect(line).toBe('[martin] Iteration 1/10 | chunk: my-chunk');
  });

  it('formats large token counts with comma separators', () => {
    const line = formatIterationProgress({
      chunkId: 'big',
      iteration: 5,
      maxIterations: 20,
      durationMs: 120_000,
      tokensEstimated: 12345,
    });
    expect(line).toContain('~12,345 tokens');
  });

  it('rounds duration to nearest second', () => {
    const line = formatIterationProgress({
      chunkId: 'x',
      iteration: 1,
      maxIterations: 5,
      durationMs: 3_700,
    });
    expect(line).toContain('4s elapsed');
  });

  it('handles zero tokens', () => {
    const line = formatIterationProgress({
      chunkId: 'z',
      iteration: 1,
      maxIterations: 1,
      durationMs: 1_000,
      tokensEstimated: 0,
    });
    expect(line).toContain('~0 tokens');
  });
});

// ── writeProgress ──

describe('writeProgress', () => {
  it('uses carriage return + clear on TTY for non-final lines', () => {
    const chunks: string[] = [];
    const write = (s: string): void => { chunks.push(s); };

    writeProgress('test line', { final: false, isTTY: true, write });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe('\r\x1b[Ktest line');
    // Should NOT end with newline
    expect(chunks[0]).not.toMatch(/\n$/);
  });

  it('uses newline on non-TTY for non-final lines', () => {
    const chunks: string[] = [];
    const write = (s: string): void => { chunks.push(s); };

    writeProgress('test line', { final: false, isTTY: false, write });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe('test line\n');
  });

  it('writes final line with newline on TTY (clears then prints)', () => {
    const chunks: string[] = [];
    const write = (s: string): void => { chunks.push(s); };

    writeProgress('done', { final: true, isTTY: true, write });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe('\r\x1b[Kdone\n');
  });

  it('writes final line with newline on non-TTY', () => {
    const chunks: string[] = [];
    const write = (s: string): void => { chunks.push(s); };

    writeProgress('done', { final: true, isTTY: false, write });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe('done\n');
  });
});
