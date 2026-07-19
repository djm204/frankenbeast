import { createServer, get } from 'node:http';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { closeHttpServer, handleHonoHttpRequest } from '../../../src/http/http-server-utils.js';

describe('http-server-utils', () => {
  it('uses an already-aborted request as an immediate abort signal', async () => {
    const app = new Hono();
    let resolveAbort!: () => void;
    const aborted = new Promise<void>((resolve) => {
      resolveAbort = resolve;
    });

    app.get('/stream', (c) => {
      if (c.req.raw.signal.aborted) {
        resolveAbort();
      } else {
        c.req.raw.signal.addEventListener('abort', () => {
          resolveAbort();
        }, { once: true });
      }
      return new Response(null, { status: 204 });
    });

    const fakeRequest = {
      headers: {},
      method: 'GET',
      url: '/stream',
      socket: { remoteAddress: '127.0.0.1' },
      aborted: true,
      destroyed: true,
      on: () => undefined,
    } as Parameters<typeof handleHonoHttpRequest>[0];

    let statusCode = 0;
    const fakeResponse = {
      setHeader: () => undefined,
      set: () => undefined,
      end: () => undefined,
    } as unknown as Parameters<typeof handleHonoHttpRequest>[1] & { statusCode: number; statusMessage: string };

    Object.defineProperties(fakeResponse, {
      statusCode: {
        get: () => statusCode,
        set: (value: number) => {
          statusCode = value;
        },
      },
    });

    await handleHonoHttpRequest(app, fakeRequest, fakeResponse);

    await expect(Promise.race([
      aborted.then(() => 'aborted'),
      new Promise((resolve) => setTimeout(() => resolve('timeout'), 500)),
    ])).resolves.toBe('aborted');
    expect(statusCode).toBe(204);
  });

  it('aborts the Hono request signal when the client disconnects', async () => {
    const app = new Hono();
    let resolveAbort!: () => void;
    const aborted = new Promise<void>((resolve) => {
      resolveAbort = resolve;
    });
    let resolveHandlerReady!: () => void;
    const handlerReady = new Promise<void>((resolve) => {
      resolveHandlerReady = resolve;
    });

    app.get('/stream', (c) => {
      c.req.raw.signal.addEventListener('abort', () => {
        resolveAbort();
      }, { once: true });
      resolveHandlerReady();
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

    try {
      const request = get(`http://127.0.0.1:${address.port}/stream`);
      request.on('error', () => {
        // Expected after destroying the client side of the long-lived request.
      });

      // Wait until the Hono handler has attached the abort listener before destroying
      // the request. This avoids relying on wall-clock disconnect timing in slow CI.
      await handlerReady;
      request.destroy();

      await expect(Promise.race([
        aborted.then(() => 'aborted'),
        new Promise((resolve) => setTimeout(() => resolve('timeout'), 5_000)),
      ])).resolves.toBe('aborted');
    } finally {
      server.closeAllConnections();
      await closeHttpServer(server);
    }
  });
});
