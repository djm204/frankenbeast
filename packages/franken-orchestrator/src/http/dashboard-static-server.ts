import { createServer, type IncomingHttpHeaders, type Server as HttpServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVICE_IDENTITY = 'dashboard-web';
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

function response(body: BodyInit | null, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('x-frankenbeast-service', SERVICE_IDENTITY);
  return new Response(body, { ...init, headers });
}

function isReservedBackendPath(pathname: string): boolean {
  return RESERVED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
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

export async function createDashboardStaticResponse(request: Request, staticDir: string): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return response('Method Not Allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
  }

  const url = new URL(request.url);
  if (url.pathname === '/health') {
    return response(JSON.stringify({ service: SERVICE_IDENTITY, ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  if (isReservedBackendPath(url.pathname)) {
    return response('Not Found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
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

export async function startDashboardStaticServer(options: {
  host: string;
  port: number;
  staticDir: string;
}): Promise<HttpServer> {
  const server = createServer((req, res) => {
    const host = req.headers.host ?? `${options.host}:${options.port}`;
    const requestInit: RequestInit = { headers: headersFromIncoming(req.headers) };
    if (req.method) {
      requestInit.method = req.method;
    }
    const request = new Request(`http://${host}${req.url ?? '/'}`, requestInit);
    void createDashboardStaticResponse(request, options.staticDir)
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
  return server;
}

function parseCliArgs(argv: string[]): { host: string; port: number; staticDir: string } {
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
  return { host, port, staticDir };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  const options = parseCliArgs(process.argv.slice(2));
  const server = await startDashboardStaticServer(options);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : options.port;
  console.log(`Dashboard static server listening on http://${options.host}:${port}`);
}
