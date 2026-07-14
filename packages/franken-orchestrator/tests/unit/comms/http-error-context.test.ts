import { describe, expect, it, vi } from 'vitest';
import { formatHttpErrorMessage, redactHttpErrorSecrets } from '../../../src/comms/channels/http-error-context.js';

const responseBody = (value: string) => new ReadableStream<Uint8Array>({
  start(controller) {
    controller.enqueue(new TextEncoder().encode(value));
    controller.close();
  },
});

describe('http error context', () => {
  it('bounds streamed response bodies before formatting provider errors', async () => {
    const message = await formatHttpErrorMessage('Provider failed', {
      status: 502,
      statusText: 'Bad Gateway',
      body: responseBody('x'.repeat(3000)),
    } as Response, 'https://discord.example.test/webhook');

    expect(message).toBe(`Provider failed: 502 Bad Gateway for https://discord.example.test/webhook: ${'x'.repeat(2048)}…`);
  });

  it('does not fall back to unbounded text() reads when a body stream is unavailable', async () => {
    const text = vi.fn().mockResolvedValue('unbounded body');
    const message = await formatHttpErrorMessage('Provider failed', {
      status: 500,
      statusText: 'Internal Server Error',
      body: null,
      text,
    } as unknown as Response, 'https://slack.example.test/webhook');

    expect(message).toBe('Provider failed: 500 Internal Server Error for https://slack.example.test/webhook');
    expect(text).not.toHaveBeenCalled();
  });

  it('redacts unterminated quoted auth fields in malformed error bodies', () => {
    expect(redactHttpErrorSecrets('{"Authorization":"Bearer leaked-token')).toBe('{"Authorization":"[REDACTED]"');
  });

  it('redacts array-valued auth fields in malformed error bodies', () => {
    expect(redactHttpErrorSecrets('{"Authorization":["Bearer leaked-token"]}')).toBe('{"Authorization":["[REDACTED]"]}');
  });

  it('redacts credential-bearing URLs in provider error bodies', () => {
    expect(redactHttpErrorSecrets('proxy echoed https://user:pass@hooks.slack.com/services/T000/B000/secret?token=value'))
      .toBe('proxy echoed https://hooks.slack.com/services/[REDACTED]');
    expect(redactHttpErrorSecrets('proxy echoed https://api.telegram.org/bot123456:secret/sendMessage'))
      .toBe('proxy echoed https://api.telegram.org/[REDACTED]/sendMessage');
  });

  it('does not mark exact-limit provider bodies as truncated', async () => {
    const message = await formatHttpErrorMessage('Provider failed', {
      status: 502,
      statusText: 'Bad Gateway',
      body: responseBody('x'.repeat(2048)),
    } as Response, 'https://discord.example.test/webhook');

    expect(message).toBe(`Provider failed: 502 Bad Gateway for https://discord.example.test/webhook: ${'x'.repeat(2048)}`);
  });

  it('stops waiting on stalled provider error bodies', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('partial'));
      },
    });
    const startedAt = Date.now();

    const message = await formatHttpErrorMessage('Provider failed', {
      status: 502,
      statusText: 'Bad Gateway',
      body: stream,
    } as Response, 'https://discord.example.test/webhook');

    expect(Date.now() - startedAt).toBeLessThan(750);
    expect(message).toBe('Provider failed: 502 Bad Gateway for https://discord.example.test/webhook: partial…');
  });
});
