import { spawn } from 'node:child_process';
import { createServer, type IncomingHttpHeaders, type Server as HttpServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVICE_IDENTITY = 'dashboard-web';
const LOCAL_HTTP_PROTOCOL = 'http:';
const RESERVED_PREFIXES = ['/api', '/v1', '/webhooks', '/comms'];
const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
};

export interface DashboardStaticResponseOptions {
  apiTarget?: string | undefined;
  operatorToken?: string | undefined;
}

export interface DashboardStaticServerOptions extends DashboardStaticResponseOptions {
  host: string;
  port: number;
  staticDir: string;
  buildCommand?: string | undefined;
  buildArgs?: string[] | undefined;
}

function response(body: BodyInit | null, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('x-frankenbeast-service', SERVICE_IDENTITY);
  return new Response(body, { ...init, headers });
}

function isReservedBackendPath(pathname: string): boolean {
  return RESERVED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function normalizeBaseUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/\/+$/, '');
}

function isSameOriginProxyRequest(request: Request): boolean {
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && !['none', 'same-origin'].includes(fetchSite)) {
    return false;
  }

  const origin = request.headers.get('origin');
  if (!origin && !fetchSite) {
    return true;
  }
  if (!origin) {
    return fetchSite === 'same-origin';
  }

  try {
    const originUrl = new URL(origin);
    const requestUrl = new URL(request.url);
    return originUrl.protocol === requestUrl.protocol && originUrl.host === requestUrl.host;
  } catch {
    return false;
  }
}

async function createProxyResponse(
  request: Request,
  options: DashboardStaticResponseOptions,
): Promise<Response | undefined> {
  const apiTarget = normalizeBaseUrl(options.apiTarget);
  const sourceUrl = new URL(request.url);
  if (!apiTarget || !isReservedBackendPath(sourceUrl.pathname)) {
    return undefined;
  }
  if (options.operatorToken && !isSameOriginProxyRequest(request)) {
    return response('Forbidden', { status: 403, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }

  const targetUrl = new URL(`${sourceUrl.pathname}${sourceUrl.search}`, `${apiTarget}/`);
  const headers = new Headers(request.headers);
  headers.delete('host');
  if (options.operatorToken) {
    headers.set('authorization', `Bearer ${options.operatorToken}`);
  }

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: 'manual',
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }
  return fetch(targetUrl, init);
}

function resolveSafeAssetPath(staticDir: string, pathname: string): string | undefined {
  const decodedPath = decodeURIComponent(pathname);
  const normalizedPath = normalize(decodedPath).replace(/^([/\\])+/, '');
  const root = resolve(staticDir);
  const candidate = resolve(join(root, normalizedPath));
  const rel = relative(root, candidate);
  if (rel === '' || (!rel.startsWith('..') && !rel.includes(`..${sep}`) && !rel.startsWith(sep))) {
    return candidate;
  }
  return undefined;
}

async function readStaticFile(filePath: string): Promise<Response | undefined> {
  try {
    const info = await stat(filePath);
    if (!info.isFile()) {
      return undefined;
    }
    const content = await readFile(filePath);
    const headers = new Headers({
      'content-type': MIME_TYPES[extname(filePath)] ?? 'application/octet-stream',
      'cache-control': extname(filePath) === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    });
    return response(content, { status: 200, headers });
  } catch {
    return undefined;
  }
}

export async function createDashboardStaticResponse(
  request: Request,
  staticDir: string,
  options: DashboardStaticResponseOptions = {},
): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/health') {
    return response(JSON.stringify({ service: SERVICE_IDENTITY, ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  if (isReservedBackendPath(url.pathname)) {
    return await createProxyResponse(request, options)
      ?? response('Not Found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return response('Method Not Allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
  }

  const safePath = resolveSafeAssetPath(staticDir, url.pathname === '/' ? '/index.html' : url.pathname);
  if (!safePath) {
    return response('Not Found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }

  const asset = await readStaticFile(safePath);
  if (asset) {
    return request.method === 'HEAD' ? response(null, { status: asset.status, headers: asset.headers }) : asset;
  }

  if (extname(url.pathname)) {
    return response('Not Found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }

  const indexPath = resolveSafeAssetPath(staticDir, '/index.html');
  const index = indexPath ? await readStaticFile(indexPath) : undefined;
  if (!index) {
    return response('Dashboard build missing index.html', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  return request.method === 'HEAD' ? response(null, { status: index.status, headers: index.headers }) : index;
}

function headersFromIncoming(headers: IncomingHttpHeaders): Headers {
  const result = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      for (const item of value) result.append(key, item);
    } else if (value !== undefined) {
      result.set(key, value);
    }
  }
  return result;
}

function startOptionalBuild(options: DashboardStaticServerOptions): void {
  if (!options.buildCommand) {
    return;
  }
  const child = spawn(options.buildCommand, options.buildArgs ?? [], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });
  child.once('exit', (code) => {
    if (code && code !== 0) {
      console.error(`Dashboard build command exited with status ${code}`);
    }
  });
}

export async function startDashboardStaticServer(options: DashboardStaticServerOptions): Promise<HttpServer> {
  const server = createServer((req, res) => {
    const host = req.headers.host ?? `${options.host}:${options.port}`;
    const requestInit: RequestInit = { headers: headersFromIncoming(req.headers) };
    if (req.method) {
      requestInit.method = req.method;
    }
    const requestUrl = new URL(req.url ?? '/', `${LOCAL_HTTP_PROTOCOL}//${host}`);
    const request = new Request(requestUrl, requestInit);
    void createDashboardStaticResponse(request, options.staticDir, options)
      .then(async (staticResponse) => {
        res.statusCode = staticResponse.status;
        staticResponse.headers.forEach((value, key) => res.setHeader(key, value));
        if (req.method === 'HEAD') {
          res.end();
          return;
        }
        const body = staticResponse.body ? Buffer.from(await staticResponse.arrayBuffer()) : undefined;
        res.end(body);
      })
      .catch((error) => {
        res.statusCode = 500;
        res.setHeader('content-type', 'text/plain; charset=utf-8');
        res.end(error instanceof Error ? error.message : String(error));
      });
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(options.port, options.host, () => {
      server.off('error', rejectListen);
      resolveListen();
    });
  });
  startOptionalBuild(options);
  return server;
}

function parseCliArgs(argv: string[]): DashboardStaticServerOptions {
  const readValue = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const host = readValue('--host') ?? '127.0.0.1';
  const port = Number.parseInt(readValue('--port') ?? '5173', 10);
  const staticDir = readValue('--static-dir') ?? 'packages/franken-web/dist';
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid --port value: ${readValue('--port') ?? ''}`);
  }
  const buildArgStart = argv.indexOf('--build-args');
  return {
    host,
    port,
    staticDir,
    apiTarget: readValue('--api-target') ?? process.env.FRANKENBEAST_DASHBOARD_API_URL,
    operatorToken: process.env.FRANKENBEAST_BEAST_OPERATOR_TOKEN,
    buildCommand: readValue('--build-command'),
    buildArgs: buildArgStart >= 0 ? argv.slice(buildArgStart + 1) : undefined,
  };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  const options = parseCliArgs(process.argv.slice(2));
  const server = await startDashboardStaticServer(options);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : options.port;
  console.log(`Dashboard static server listening on ${LOCAL_HTTP_PROTOCOL}//${options.host}:${port}`);
}
