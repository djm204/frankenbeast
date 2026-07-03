import { createServer } from 'node:http';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { closeHttpServer, handleHonoHttpRequest } from '../../../src/http/http-server-utils.js';

describe('http-server-utils', () => {
  it('aborts the Hono request signal when the client disconnects', async () => {
    const app = new Hono();
    let resolveAbort!: () => void;
    const aborted = new Promise<void>((resolve) => {
      resolveAbort = resolve;
    });

    app.get('/stream', (c) => {
      c.req.raw.signal.addEventListener('abort', () => {
        resolveAbort();
      }, { once: true });
      return new Promise<Response>(() => undefined);
    });

    const server = createServer((request, response) => {
      void handleHonoHttpRequest(app, request, response);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('server did not bind to a TCP address');
    }

    const request = await import('node:http').then(({ get }) => get(`http://127.0.0.1:${address.port}/stream`));
    request.on('error', () => {
      // Expected after destroying the client side of the long-lived request.
    });
    setTimeout(() => request.destroy(), 10);

    await expect(Promise.race([
      aborted.then(() => 'aborted'),
      new Promise((resolve) => setTimeout(() => resolve('timeout'), 1_000)),
    ])).resolves.toBe('aborted');
    server.closeAllConnections();
    await closeHttpServer(server);
  });
});
