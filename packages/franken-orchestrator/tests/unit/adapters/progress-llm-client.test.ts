import { describe, it, expect, vi } from 'vitest';
import type { ILlmClient } from '@franken/core';
import { ProgressLlmClient } from '../../../src/adapters/progress-llm-client.js';

function mockLlm(response: string, delayMs = 0): ILlmClient {
  return {
    complete: vi.fn(async () => {
      if (delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }

      return response;
    }),
  };
}

describe('ProgressLlmClient', () => {
  it('delegates to inner client and returns the exact result', async () => {
    const inner = mockLlm('hello world');
    const client = new ProgressLlmClient(inner, { silent: true });

    const result = await client.complete('test prompt');

    expect(result).toBe('hello world');
    expect(inner.complete).toHaveBeenCalledWith('test prompt');
  });

  it('shows the configured spinner label and completion stats when not silent', async () => {
    const writeSpy = vi.fn();
    const inner = mockLlm('a response with some tokens');
    const client = new ProgressLlmClient(inner, {
      label: 'Generating...',
      write: writeSpy,
    });

    await client.complete('prompt');

    const allOutput = writeSpy.mock.calls.map(call => call[0]).join('');
    expect(allOutput).toContain('Generating...');
    expect(allOutput).toMatch(/\d+\.\ds/);
  });

  it('uses the default label when none is provided', async () => {
    const writeSpy = vi.fn();
    const inner = mockLlm('response');
    const client = new ProgressLlmClient(inner, { write: writeSpy });

    await client.complete('prompt');

    const allOutput = writeSpy.mock.calls.map(call => call[0]).join('');
    expect(allOutput).toContain('Thinking...');
  });

  it('reports approximate token count using the 1.3 tokens per word heuristic', async () => {
    const writeSpy = vi.fn();
    const inner = mockLlm('one two three four five six seven eight nine ten');
    const client = new ProgressLlmClient(inner, { write: writeSpy });

    await client.complete('prompt');

    const allOutput = writeSpy.mock.calls.map(call => call[0]).join('');
    expect(allOutput).toContain('~13 tokens');
  });

  it('still returns the LLM result even if spinner output throws', async () => {
    const writeSpy = vi.fn(() => {
      throw new Error('write failed');
    });
    const inner = mockLlm('result');
    const client = new ProgressLlmClient(inner, { write: writeSpy });

    const result = await client.complete('prompt');

    expect(result).toBe('result');
  });

  it('stops spinner output before rethrowing inner client errors', async () => {
    const writeSpy = vi.fn();
    const failure = new Error('boom');
    const inner: ILlmClient = {
      complete: vi.fn(async () => {
        throw failure;
      }),
    };
    const client = new ProgressLlmClient(inner, { write: writeSpy });

    await expect(client.complete('prompt')).rejects.toThrow('boom');

    const allOutput = writeSpy.mock.calls.map(call => call[0]).join('');
    expect(allOutput).toContain('Thinking...');
    expect(allOutput).toContain('\r\x1b[K');
  });
});
