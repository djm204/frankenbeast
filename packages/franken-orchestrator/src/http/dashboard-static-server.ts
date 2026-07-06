import { spawn } from 'node:child_process';
import { createServer, request as httpRequest, type IncomingHttpHeaders, type IncomingMessage, type Server as HttpServer, type ServerResponse } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { readFile, stat } from 'node:fs/promises';
import { extname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseDotenv } from 'dotenv';
import { OrchestratorConfigSchema } from '../config/orchestrator-config.js';
import { createSecretStore } from '../network/secret-store.js';

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

const VALID_HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

type DashboardBuildStatus =
  | { state: 'ready' }
  | { state: 'building' }
  | { state: 'failed'; message: string };

const HOP_BY_HOP_HEADERS = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
] as const;

export interface DashboardStaticResponseOptions {
  apiTarget?: string | undefined;
  operatorToken?: string | undefined;
  signal?: AbortSignal | undefined;
  buildStatus?: DashboardBuildStatus | undefined;
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

function isPublicWebhookPath(pathname: string): boolean {
  return pathname === '/webhooks' || pathname.startsWith('/webhooks/');
}

function normalizeBaseUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/\/+$/, '');
}


function removeHopByHopHeaders(headers: Headers): void {
  const connectionTokens = headers.get('connection')
    ?.split(',')
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token && VALID_HEADER_NAME.test(token)) ?? [];
  for (const header of [...HOP_BY_HOP_HEADERS, 'host', ...connectionTokens]) {
    headers.delete(header);
  }
}

function isSameOriginProxyRequest(request: Request): boolean {
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && !['none', 'same-origin'].includes(fetchSite)) {
    return false;
  }

  const origin = request.headers.get('origin');
  if (!origin && !fetchSite) {
    return false;
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
  if (options.operatorToken && !isPublicWebhookPath(sourceUrl.pathname) && !isSameOriginProxyRequest(request)) {
    return response('Forbidden', { status: 403, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }

  const targetUrl = resolveProxyTargetUrl(apiTarget, sourceUrl);
  const headers = new Headers(request.headers);
  removeHopByHopHeaders(headers);
  if (options.operatorToken) {
    headers.set('authorization', `Bearer ${options.operatorToken}`);
  }

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: 'manual',
    ...(options.signal ? { signal: options.signal } : {}),
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }
  const upstreamResponse = await fetch(targetUrl, init);
  const responseHeaders = new Headers(upstreamResponse.headers);
  removeHopByHopHeaders(responseHeaders);
  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}

function resolveProxyTargetUrl(apiTarget: string, sourceUrl: URL): URL {
  const targetBase = new URL(`${apiTarget}/`);
  const basePath = targetBase.pathname.replace(/\/+$/, '');
  targetBase.pathname = `${basePath}${sourceUrl.pathname}`.replace(/\/+/g, '/');
  targetBase.search = sourceUrl.search;
  return targetBase;
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
    if (options.buildStatus?.state === 'building') {
      return response(JSON.stringify({ service: SERVICE_IDENTITY, ok: false, reason: 'dashboard-build-building' }), {
        status: 503,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }
    if (options.buildStatus?.state === 'failed') {
      return response(JSON.stringify({
        service: SERVICE_IDENTITY,
        ok: false,
        reason: 'dashboard-build-failed',
        message: options.buildStatus.message,
      }), {
        status: 503,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }
    const indexPath = resolveSafeAssetPath(staticDir, '/index.html');
    const index = indexPath ? await readStaticFile(indexPath) : undefined;
    if (!index) {
      return response(JSON.stringify({ service: SERVICE_IDENTITY, ok: false, reason: 'dashboard-build-missing' }), {
        status: 503,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }
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

function requestBaseUrlFromIncoming(headers: IncomingHttpHeaders, host: string): string {
  const forwardedProto = Array.isArray(headers['x-forwarded-proto'])
    ? headers['x-forwarded-proto'][0]
    : headers['x-forwarded-proto'];
  const protocol = forwardedProto?.split(',')[0]?.trim().toLowerCase() === 'https' ? 'https:' : LOCAL_HTTP_PROTOCOL;
  return `${protocol}//${host}`;
}

async function readIncomingBody(req: IncomingMessage): Promise<Buffer | undefined> {
  if (req.method === 'GET' || req.method === 'HEAD') {
    return undefined;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return chunks.length > 0 ? Buffer.concat(chunks) : undefined;
}

async function writeWebResponse(staticResponse: Response, method: string | undefined, res: ServerResponse): Promise<void> {
  res.statusCode = staticResponse.status;
  staticResponse.headers.forEach((value, key) => {
    if (key.toLowerCase() !== 'content-encoding' && key.toLowerCase() !== 'content-length') {
      res.setHeader(key, value);
    }
  });
  if (method === 'HEAD' || !staticResponse.body) {
    res.end();
    return;
  }

  const reader = staticResponse.body.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value && !res.write(Buffer.from(value))) {
      await new Promise<void>((resolveDrain) => res.once('drain', resolveDrain));
    }
  }
  res.end();
}

function sendUpgradeFailure(socket: NodeJS.WritableStream, statusCode: number, message: string): void {
  socket.write(`HTTP/1.1 ${statusCode} ${message}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.end();
}

function attachBackendUpgradeProxy(server: HttpServer, options: DashboardStaticServerOptions): void {
  server.on('upgrade', (req, socket, head) => {
    const apiTarget = normalizeBaseUrl(options.apiTarget);
    const host = req.headers.host ?? `${options.host}:${options.port}`;
    const requestUrl = new URL(req.url ?? '/', requestBaseUrlFromIncoming(req.headers, host));
    if (!apiTarget || !isReservedBackendPath(requestUrl.pathname)) {
      sendUpgradeFailure(socket, 404, 'Not Found');
      return;
    }

    const sameOriginProbe = new Request(requestUrl, { headers: headersFromIncoming(req.headers), method: 'GET' });
    if (options.operatorToken && !isSameOriginProxyRequest(sameOriginProbe)) {
      sendUpgradeFailure(socket, 403, 'Forbidden');
      return;
    }

    const targetUrl = resolveProxyTargetUrl(apiTarget, requestUrl);
    const headers = { ...req.headers, host: targetUrl.host };
    if (options.operatorToken) {
      headers.authorization = `Bearer ${options.operatorToken}`;
    }
    const proxyRequest = (targetUrl.protocol === 'https:' ? httpsRequest : httpRequest)({
      protocol: targetUrl.protocol,
      hostname: targetUrl.hostname,
      port: targetUrl.port,
      path: `${targetUrl.pathname}${targetUrl.search}`,
      method: req.method,
      headers,
    });
    proxyRequest.once('upgrade', (proxyResponse, proxySocket, proxyHead) => {
      socket.write(`HTTP/1.1 ${proxyResponse.statusCode ?? 101} ${proxyResponse.statusMessage ?? 'Switching Protocols'}\r\n`);
      for (const [key, value] of Object.entries(proxyResponse.headers)) {
        if (Array.isArray(value)) {
          for (const item of value) socket.write(`${key}: ${item}\r\n`);
        } else if (value !== undefined) {
          socket.write(`${key}: ${value}\r\n`);
        }
      }
      socket.write('\r\n');
      if (proxyHead.length > 0) socket.write(proxyHead);
      if (head.length > 0) proxySocket.write(head);
      proxySocket.pipe(socket).pipe(proxySocket);
    });
    proxyRequest.once('response', (proxyResponse) => {
      sendUpgradeFailure(socket, proxyResponse.statusCode ?? 502, proxyResponse.statusMessage ?? 'Bad Gateway');
      proxyResponse.resume();
    });
    proxyRequest.once('error', () => sendUpgradeFailure(socket, 502, 'Bad Gateway'));
    proxyRequest.end();
  });
}

function startOptionalBuild(options: DashboardStaticServerOptions): DashboardBuildStatus {
  if (!options.buildCommand) {
    return { state: 'ready' };
  }
  const status: DashboardBuildStatus = { state: 'building' };
  const child = spawn(options.buildCommand, options.buildArgs ?? [], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });
  child.once('error', (error) => {
    Object.assign(status, { state: 'failed', message: error.message });
  });
  child.once('exit', (code, signal) => {
    if (code === 0) {
      Object.assign(status, { state: 'ready' });
      return;
    }
    const message = signal
      ? `Dashboard build command terminated by signal ${signal}`
      : `Dashboard build command exited with status ${code ?? 'unknown'}`;
    Object.assign(status, { state: 'failed', message });
    console.error(message);
  });
  return status;
}

export async function startDashboardStaticServer(options: DashboardStaticServerOptions): Promise<HttpServer> {
  let buildStatus: DashboardBuildStatus = options.buildCommand ? { state: 'building' } : { state: 'ready' };
  const server = createServer((req, res) => {
    const host = req.headers.host ?? `${options.host}:${options.port}`;
    const abortController = new AbortController();
    const abortRequest = () => abortController.abort();
    req.once('aborted', abortRequest);
    req.once('error', abortRequest);
    res.once('close', () => {
      if (!res.writableEnded) abortRequest();
    });
    void readIncomingBody(req)
      .then(async (body) => {
        const requestInit: RequestInit = { headers: headersFromIncoming(req.headers) };
        if (body) {
          requestInit.body = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as BodyInit;
        }
        if (req.method) {
          requestInit.method = req.method;
        }
        const requestUrl = new URL(req.url ?? '/', requestBaseUrlFromIncoming(req.headers, host));
        const request = new Request(requestUrl, requestInit);
        const staticResponse = await createDashboardStaticResponse(request, options.staticDir, {
          ...options,
          buildStatus,
          signal: abortController.signal,
        });
        await writeWebResponse(staticResponse, req.method, res);
      })
      .catch((error) => {
        if (res.headersSent) {
          res.destroy(error instanceof Error ? error : new Error(String(error)));
          return;
        }
        res.statusCode = 500;
        res.setHeader('content-type', 'text/plain; charset=utf-8');
        res.end(error instanceof Error ? error.message : String(error));
      });
  });
  attachBackendUpgradeProxy(server, options);

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(options.port, options.host, () => {
      server.off('error', rejectListen);
      buildStatus = startOptionalBuild(options);
      resolveListen();
    });
  });
  return server;
}

async function readOperatorTokenFromEnvFile(filePath: string): Promise<string | undefined> {
  try {
    const parsed = parseDotenv(await readFile(filePath, 'utf8'));
    return parsed.FRANKENBEAST_BEAST_OPERATOR_TOKEN?.trim() || undefined;
  } catch {
    return undefined;
  }
}

async function resolveDashboardOperatorToken(): Promise<string | undefined> {
  const configPath = process.env.FRANKENBEAST_CONFIG_FILE
    || process.env.FRANKENBEAST_CONFIG_PATH
    || join(process.cwd(), '.fbeast', 'config.json');
  if (configPath) {
    try {
      const resolvedConfigPath = isAbsolute(configPath) ? configPath : resolve(process.cwd(), configPath);
      const config = OrchestratorConfigSchema.parse(JSON.parse(await readFile(resolvedConfigPath, 'utf8')));
      const tokenRef = config.network.operatorTokenRef?.trim();
      if (tokenRef) {
        const store = createSecretStore(config.network.secureBackend ?? 'local-encrypted', {
          projectRoot: process.cwd(),
          passphrase: process.env.FRANKENBEAST_PASSPHRASE,
        });
        const token = await store.resolve(tokenRef);
        if (token?.trim()) return token.trim();
      }
    } catch {
      // Secret-store resolution is best-effort here; fall back to direct env/file wiring below.
    }
  }

  const envToken = process.env.FRANKENBEAST_BEAST_OPERATOR_TOKEN?.trim();
  if (envToken) return envToken;
  return await readOperatorTokenFromEnvFile(join(process.cwd(), '.env'))
    ?? await readOperatorTokenFromEnvFile(join(process.cwd(), 'packages', 'franken-web', '.env.local'));
}

async function parseCliArgs(argv: string[]): Promise<DashboardStaticServerOptions> {
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
    operatorToken: await resolveDashboardOperatorToken(),
    buildCommand: readValue('--build-command'),
    buildArgs: buildArgStart >= 0 ? argv.slice(buildArgStart + 1) : undefined,
  };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  const options = await parseCliArgs(process.argv.slice(2));
  const server = await startDashboardStaticServer(options);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : options.port;
  console.log(`Dashboard static server listening on ${LOCAL_HTTP_PROTOCOL}//${options.host}:${port}`);
}
