import { describe, it, expect } from 'vitest';
import { OutputValidationMiddleware } from '../../../src/middleware/output-validation.js';
import type { LlmResponse } from '../../../src/middleware/llm-middleware.js';

function makeResponse(content: string): LlmResponse {
  return { content, usage: { inputTokens: 10, outputTokens: 5 } };
}

describe('OutputValidationMiddleware', () => {
  it('passes normal responses through', () => {
    const mw = new OutputValidationMiddleware();
    const resp = makeResponse('Hello world');
    expect(mw.afterResponse(resp)).toBe(resp);
  });

  it('truncates oversized responses', () => {
    const mw = new OutputValidationMiddleware({ maxResponseLength: 20 });
    const resp = makeResponse('a'.repeat(50));
    const result = mw.afterResponse(resp);
    expect(result.content.length).toBeLessThan(100); // truncated + notice
    expect(result.content).toContain('[TRUNCATED');
  });

  it('appends truncation notice', () => {
    const mw = new OutputValidationMiddleware({ maxResponseLength: 10 });
    const resp = makeResponse('a'.repeat(50));
    const result = mw.afterResponse(resp);
    expect(result.content).toContain('[TRUNCATED: response exceeded maximum length]');
  });

  it('uses default max of 100_000', () => {
    const mw = new OutputValidationMiddleware();
    const resp = makeResponse('a'.repeat(100));
    expect(mw.afterResponse(resp).content).toBe('a'.repeat(100));
  });

  it('beforeRequest passes through unchanged', () => {
    const mw = new OutputValidationMiddleware();
    const req = { systemPrompt: '', messages: [{ role: 'user' as const, content: 'Hi' }] };
    expect(mw.beforeRequest(req)).toBe(req);
  });
});
