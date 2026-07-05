import type { IncomingMessage, Server as HttpServer, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Hono } from 'hono';
import { redactTelegramBotTokenUrls } from '../security/telegram-redaction.js';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 3737;
const TRUSTED_REMOTE_ADDRESS_HEADER = 'x-frankenbeast-remote-address';

export async function handleHonoHttpRequest(app: Hono, request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const honoRequest = toRequest(request);
    const honoResponse = await app.fetch(honoRequest);

    response.statusCode = honoResponse.status;
    response.statusMessage = honoResponse.statusText;
    for (const [key, value] of honoResponse.headers.entries()) {
      response.setHeader(key, value);
    }

    if (!honoResponse.body) {
      response.end();
      return;
    }

    await pipeline(Readable.fromWeb(honoResponse.body as unknown as import('node:stream/web').ReadableStream), response);
  } catch (error) {
    response.statusCode = 500;
    response.end(error instanceof Error ? redactTelegramBotTokenUrls(error.message) : 'Internal Server Error');
  }
}

function toRequest(request: IncomingMessage): Request {
  const host = request.headers.host ?? `${DEFAULT_HOST}:${DEFAULT_PORT}`;
  const url = new URL(request.url ?? '/', `http://${host}`);
  const method = request.method ?? 'GET';
  const headers = new Headers();
  const abortController = new AbortController();

  const abortRequest = () => abortController.abort();
  request.on('aborted', abortRequest);
  request.on('close', abortRequest);
  request.on('error', abortRequest);
  // If the request is already aborted or destroyed, abort immediately.
  if (request.aborted || request.destroyed) {
    abortRequest();
  }

  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
      continue;
    }
    headers.set(key, value);
  }

  // Set after copying request headers so clients cannot spoof the trusted peer
  // address consumed by security-sensitive route guards.
  headers.set(TRUSTED_REMOTE_ADDRESS_HEADER, request.socket.remoteAddress ?? '');

  if (method === 'GET' || method === 'HEAD') {
    return new Request(url, { method, headers, signal: abortController.signal });
  }

  return new Request(url, {
    method,
    headers,
    signal: abortController.signal,
    body: Readable.toWeb(request) as ReadableStream,
    ...( { duplex: 'half' } as { duplex: 'half' } ),
  } as RequestInit);
}

export function closeHttpServer(server: HttpServer): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
