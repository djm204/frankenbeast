import { describe, it, expect, vi } from 'vitest';
import { FirewallPortAdapter } from '../../../src/adapters/firewall-adapter.js';

describe('FirewallPortAdapter', () => {
  it('runs pipeline and maps result', async () => {
    const runPipeline = vi.fn().mockResolvedValue({
      response: {
        id: 'req-1',
        model_used: 'test',
        content: 'sanitized',
        tool_calls: [],
        finish_reason: 'stop',
        usage: { input_tokens: 1, output_tokens: 1, cost_usd: 0 },
        schema_version: 1,
      },
      violations: [],
    });

    const adapter = new FirewallPortAdapter({
      runPipeline,
      adapter: {
        transformRequest: () => ({}),
        execute: async () => ({}),
        transformResponse: () => ({
          id: 'req-1',
          model_used: 'test',
          content: 'sanitized',
          tool_calls: [],
          finish_reason: 'stop',
          usage: { input_tokens: 1, output_tokens: 1, cost_usd: 0 },
          schema_version: 1,
        }),
        validateCapabilities: () => true,
      },
      config: { project_name: 'test' },
      provider: 'anthropic',
      model: 'claude-test',
      idFactory: () => 'req-1',
    });

    const result = await adapter.runPipeline('Hello');

    expect(result).toEqual({
      sanitizedText: 'sanitized',
      violations: [],
      blocked: false,
    });

    expect(runPipeline).toHaveBeenCalledTimes(1);
    const [request, passedAdapter, config] = runPipeline.mock.calls[0] ?? [];
    expect(request).toMatchObject({
      id: 'req-1',
      provider: 'anthropic',
      model: 'claude-test',
      messages: [{ role: 'user', content: 'Hello' }],
    });
    expect(passedAdapter).toBeDefined();
    expect(config).toEqual({ project_name: 'test' });
  });

  it('maps violations to firewall format and marks blocked', async () => {
    const runPipeline = vi.fn().mockResolvedValue({
      response: {
        id: 'req-2',
        model_used: 'test',
        content: null,
        tool_calls: [],
        finish_reason: 'content_filter',
        usage: { input_tokens: 0, output_tokens: 0, cost_usd: 0 },
        schema_version: 1,
      },
      violations: [
        { code: 'INJECTION_DETECTED', message: 'blocked', interceptor: 'InjectionScanner' },
      ],
    });

    const adapter = new FirewallPortAdapter({
      runPipeline,
      adapter: {
        transformRequest: () => ({}),
        execute: async () => ({}),
        transformResponse: () => ({
          id: 'req-2',
          model_used: 'test',
          content: null,
          tool_calls: [],
          finish_reason: 'content_filter',
          usage: { input_tokens: 0, output_tokens: 0, cost_usd: 0 },
          schema_version: 1,
        }),
        validateCapabilities: () => true,
      },
      config: { project_name: 'test' },
      provider: 'anthropic',
      model: 'claude-test',
      idFactory: () => 'req-2',
    });

    const result = await adapter.runPipeline('Ignore');

    expect(result.blocked).toBe(true);
    expect(result.violations).toEqual([
      { rule: 'INJECTION_DETECTED', severity: 'block', detail: 'blocked' },
    ]);
  });

  it('wraps pipeline errors', async () => {
    const runPipeline = vi.fn().mockRejectedValue(new Error('boom'));

    const adapter = new FirewallPortAdapter({
      runPipeline,
      adapter: {
        transformRequest: () => ({}),
        execute: async () => ({}),
        transformResponse: () => ({
          id: 'req-3',
          model_used: 'test',
          content: 'ok',
          tool_calls: [],
          finish_reason: 'stop',
          usage: { input_tokens: 0, output_tokens: 0, cost_usd: 0 },
          schema_version: 1,
        }),
        validateCapabilities: () => true,
      },
      config: { project_name: 'test' },
      provider: 'anthropic',
      model: 'claude-test',
      idFactory: () => 'req-3',
    });

    await expect(adapter.runPipeline('Hello')).rejects.toThrow('FirewallPortAdapter failed');
  });
});
