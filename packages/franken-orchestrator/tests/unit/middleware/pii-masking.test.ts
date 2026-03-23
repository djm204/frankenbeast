import { describe, it, expect } from 'vitest';
import type { LlmRequest } from '@franken/types';
import { PiiMaskingMiddleware } from '../../../src/middleware/pii-masking.js';
import type { LlmResponse } from '../../../src/middleware/llm-middleware.js';

function makeRequest(content: string): LlmRequest {
  return { systemPrompt: '', messages: [{ role: 'user', content }] };
}

function makeResponse(content: string): LlmResponse {
  return { content, usage: { inputTokens: 10, outputTokens: 5 } };
}

const mw = new PiiMaskingMiddleware();

describe('PiiMaskingMiddleware', () => {
  it('masks email addresses', () => {
    const result = mw.beforeRequest(makeRequest('Contact me at john@example.com'));
    expect((result.messages[0]!.content as string)).toContain('[EMAIL]');
    expect((result.messages[0]!.content as string)).not.toContain('john@example.com');
  });

  it('masks US phone numbers', () => {
    const result = mw.beforeRequest(makeRequest('Call me at 555-123-4567'));
    expect((result.messages[0]!.content as string)).toContain('[PHONE]');
    expect((result.messages[0]!.content as string)).not.toContain('555-123-4567');
  });

  it('masks SSN', () => {
    const result = mw.beforeRequest(makeRequest('My SSN is 123-45-6789'));
    expect((result.messages[0]!.content as string)).toContain('[SSN]');
    expect((result.messages[0]!.content as string)).not.toContain('123-45-6789');
  });

  it('masks credit card numbers', () => {
    const result = mw.beforeRequest(makeRequest('Card: 4111111111111111'));
    expect((result.messages[0]!.content as string)).toContain('[CC]');
    expect((result.messages[0]!.content as string)).not.toContain('4111111111111111');
  });

  it('masks IP addresses', () => {
    const result = mw.beforeRequest(makeRequest('Server at 192.168.1.100'));
    expect((result.messages[0]!.content as string)).toContain('[IP]');
  });

  it('masks PII in response (afterResponse)', () => {
    const result = mw.afterResponse(makeResponse('Email: user@test.com'));
    expect(result.content).toContain('[EMAIL]');
    expect(result.content).not.toContain('user@test.com');
  });

  it('handles multiple PII types in same text', () => {
    const result = mw.beforeRequest(
      makeRequest('Email john@test.com, SSN 123-45-6789, phone 555-123-4567'),
    );
    const content = result.messages[0]!.content as string;
    expect(content).toContain('[EMAIL]');
    expect(content).toContain('[SSN]');
    expect(content).toContain('[PHONE]');
  });

  it('preserves non-PII text', () => {
    const result = mw.beforeRequest(makeRequest('Hello world, no PII here'));
    expect((result.messages[0]!.content as string)).toBe('Hello world, no PII here');
  });

  it('handles content block arrays', () => {
    const req: LlmRequest = {
      systemPrompt: '',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'Email: user@test.com' },
        ],
      }],
    };
    const result = mw.beforeRequest(req);
    const blocks = result.messages[0]!.content as Array<{ type: string; text: string }>;
    expect(blocks[0]!.text).toContain('[EMAIL]');
  });
});
