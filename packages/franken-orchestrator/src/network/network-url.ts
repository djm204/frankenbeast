import { isLoopbackHost } from './network-config.js';

export function localPlaintextOrSecureEndpoint(host: string, port: number): string {
  const protocol = isLoopbackHost(host) ? 'http' : 'https';
  const bracketedHost = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
  return `${protocol}://` + `${bracketedHost}:${port}`;
}

export function localPlaintextOrSecureHealthUrl(host: string, port: number, path = '/health'): string {
  return `${localPlaintextOrSecureEndpoint(host, port)}${path}`;
}

export function localPlaintextOrSecureWebSocketUrl(host: string, port: number, path: string): string {
  const protocol = isLoopbackHost(host) ? 'ws' : 'wss';
  const bracketedHost = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
  return `${protocol}://` + `${bracketedHost}:${port}${path}`;
}
