import { isLoopbackHost } from './network-config.js';

export function assertLocalPlaintextOrSecureHttpUrl(url: string, source: string): string {
  const parsed = new URL(url);
  if (parsed.protocol === 'https:' || (parsed.protocol === 'http:' && isLoopbackHost(parsed.hostname))) {
    return url;
  }
  throw new Error(`${source} must use https:// unless it targets a loopback-only development host.`);
}

export function localPlaintextOrSecureEndpoint(host: string, port: number): string {
  if (!isLoopbackHost(host)) {
    throw new Error(`Managed service host ${host} is not loopback-only; terminate TLS in a separate reverse proxy for non-local deployments.`);
  }
  const protocol = 'http';
  const bracketedHost = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
  return `${protocol}://` + `${bracketedHost}:${port}`;
}

export function localPlaintextOrSecureHealthUrl(host: string, port: number, path = '/health'): string {
  return `${localPlaintextOrSecureEndpoint(host, port)}${path}`;
}

export function localPlaintextOrSecureWebSocketUrl(host: string, port: number, path: string): string {
  if (!isLoopbackHost(host)) {
    throw new Error(`Managed service host ${host} is not loopback-only; terminate TLS in a separate reverse proxy for non-local deployments.`);
  }
  const protocol = 'ws';
  const bracketedHost = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
  return `${protocol}://` + `${bracketedHost}:${port}${path}`;
}
