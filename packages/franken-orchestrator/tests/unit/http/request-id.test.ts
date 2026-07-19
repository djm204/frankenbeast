import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { requestId } from '../../../src/http/middleware.js';

function createApp() {
  const app = new Hono();
  app.use('*', requestId);
  app.get('/', (c) => c.json({ requestId: c.get('requestId') }));
  return app;
}

async function reflectedRequestId(incoming?: string): Promise<{ header: string; context: string }> {
  const app = createApp();
  const response = await app.request('http://localhost/', incoming === undefined
    ? undefined
    : { headers: { 'x-request-id': incoming } });
  const body = await response.json() as { requestId: string };
  return {
    header: response.headers.get('x-request-id') ?? '',
    context: body.requestId,
  };
}

describe('request ID middleware', () => {
  it('preserves a valid incoming request ID in the response and request context', async () => {
    const incoming = 'trace_01J2.example:span-7';

    await expect(reflectedRequestId(incoming)).resolves.toEqual({
      header: incoming,
      context: incoming,
    });
  });

  it('replaces an overlong incoming request ID', async () => {
    const incoming = 'a'.repeat(129);

    const result = await reflectedRequestId(incoming);

    expect(result.header).not.toBe(incoming);
    expect(result.context).toBe(result.header);
    expect(result.header).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it.each([
    ['spaces', 'unsafe request id'],
    ['commas', 'left,right'],
    ['non-ASCII characters', 'trace-é'],
  ])('replaces an incoming request ID containing %s', async (_description, incoming) => {
    const result = await reflectedRequestId(incoming);

    expect(result.header).not.toBe(incoming);
    expect(result.context).toBe(result.header);
    expect(result.header).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });
});
