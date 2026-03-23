import { describe, it, expect } from 'vitest';
import type { LlmRequest } from '@franken/types';
import {
  MiddlewareChain,
  type LlmMiddleware,
  type LlmResponse,
} from '../../../src/middleware/llm-middleware.js';

function makeRequest(content = 'Hello'): LlmRequest {
  return { systemPrompt: 'sys', messages: [{ role: 'user', content }] };
}

function makeResponse(content = 'Response'): LlmResponse {
  return { content, usage: { inputTokens: 10, outputTokens: 5 } };
}

function tagMiddleware(tag: string): LlmMiddleware {
  return {
    name: tag,
    beforeRequest(req: LlmRequest): LlmRequest {
      const msg = req.messages[0]!;
      const text = typeof msg.content === 'string' ? msg.content : '';
      return {
        ...req,
        messages: [{ ...msg, content: `${text}[${tag}]` }],
      };
    },
    afterResponse(resp: LlmResponse): LlmResponse {
      return { ...resp, content: `${resp.content}[${tag}]` };
    },
  };
}

describe('MiddlewareChain', () => {
  it('runs beforeRequest in order', () => {
    const chain = new MiddlewareChain();
    chain.add(tagMiddleware('A'));
    chain.add(tagMiddleware('B'));

    const result = chain.processRequest(makeRequest(''));
    const content = (result.messages[0]!.content as string);
    expect(content).toBe('[A][B]');
  });

  it('runs afterResponse in reverse order', () => {
    const chain = new MiddlewareChain();
    chain.add(tagMiddleware('A'));
    chain.add(tagMiddleware('B'));

    const result = chain.processResponse(makeResponse(''));
    expect(result.content).toBe('[B][A]');
  });

  it('add/remove middleware by name', () => {
    const chain = new MiddlewareChain();
    chain.add(tagMiddleware('A'));
    chain.add(tagMiddleware('B'));
    chain.remove('A');

    const result = chain.processRequest(makeRequest(''));
    const content = (result.messages[0]!.content as string);
    expect(content).toBe('[B]');
  });

  it('propagates errors from middleware', () => {
    const chain = new MiddlewareChain();
    chain.add({
      name: 'blocker',
      beforeRequest(): LlmRequest {
        throw new Error('blocked');
      },
      afterResponse(resp: LlmResponse): LlmResponse {
        return resp;
      },
    });

    expect(() => chain.processRequest(makeRequest())).toThrow('blocked');
  });

  it('returns unmodified request when no middleware', () => {
    const chain = new MiddlewareChain();
    const req = makeRequest('Hello');
    expect(chain.processRequest(req)).toBe(req);
  });

  it('returns unmodified response when no middleware', () => {
    const chain = new MiddlewareChain();
    const resp = makeResponse('Hello');
    expect(chain.processResponse(resp)).toBe(resp);
  });

  it('getMiddlewares returns current list', () => {
    const chain = new MiddlewareChain();
    chain.add(tagMiddleware('A'));
    chain.add(tagMiddleware('B'));
    expect(chain.getMiddlewares().map(m => m.name)).toEqual(['A', 'B']);
  });
});
