import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Readable } from 'node:stream';
import type { CommsConfig } from '../config/comms-config.js';
import { CommsConfigSchema } from '../config/comms-config.js';
import { createCommsApp } from './app.js';

export interface StartCommsServerOptions {
  config: CommsConfig;
  overrideConfig?: Partial<CommsConfig> | undefined;
  host?: string | undefined;
  port?: number | undefined;
}

export interface CommsServerHandle {
  server: HttpServer;
  url: string;
  close(): Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge<T extends Record<string, unknown>>(...layers: Array<Partial<T> | undefined>): Partial<T> {
  const result: Record<string, unknown> = {};
  for (const layer of layers) {
    if (!layer) {
      continue;
    }
    for (const [key, value] of Object.entries(layer)) {
      const existing = result[key];
      if (isRecord(existing) && isRecord(value)) {
        result[key] = deepMerge(existing, value);
      } else {
        result[key] = value;
      }
    }
  }
  return result as Partial<T>;
}

export function resolveCommsServerConfig(
  config: CommsConfig,
  overrideConfig?: Partial<CommsConfig>,
): CommsConfig {
  return CommsConfigSchema.parse(deepMerge<CommsConfig>(config, overrideConfig));
}

export async function startCommsServer(options: StartCommsServerOptions): Promise<CommsServerHandle> {
  const config = resolveCommsServerConfig(options.config, options.overrideConfig);
  const app = createCommsApp(config);
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 3200;
  const server = createServer((request, response) => {
    void handleHttpRequest(app, request, response, host, port);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Comms server did not bind to a TCP address');
  }

  return {
    server,
    url: `http://${host}:${(address as AddressInfo).port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    }),
  };
}

async function handleHttpRequest(
  app: ReturnType<typeof createCommsApp>,
  request: Parameters<HttpServer['emit']>[1],
  response: Parameters<HttpServer['emit']>[2],
  host: string,
  port: number,
): Promise<void> {
  try {
    const honoRequest = toRequest(request, host, port);
    const result = await app.fetch(honoRequest);
    response.statusCode = result.status;
    for (const [key, value] of result.headers.entries()) {
      response.setHeader(key, value);
    }
    if (!result.body) {
      response.end();
      return;
    }
    response.end(Buffer.from(await result.arrayBuffer()));
  } catch (error) {
    response.statusCode = 500;
    response.end(error instanceof Error ? error.message : 'Internal Server Error');
  }
}

function toRequest(request: Parameters<HttpServer['emit']>[1], host: string, port: number): Request {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `${host}:${port}`}`);
  const headers = new Headers();

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
    headers.set(key, String(value));
  }

  const method = request.method ?? 'GET';
  if (method === 'GET' || method === 'HEAD') {
    return new Request(url, { method, headers });
  }

  return new Request(url, {
    method,
    headers,
    body: Readable.toWeb(request) as ReadableStream,
    ...( { duplex: 'half' } as { duplex: 'half' } ),
  } as RequestInit);
}
