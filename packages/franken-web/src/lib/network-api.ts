import type { ApiDataEnvelope, NetworkConfigResponse, NetworkStatusResponse } from '@franken/types';

export type { NetworkConfigResponse, NetworkStatusResponse } from '@franken/types';

export class NetworkApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly operatorToken?: string,
  ) {}

  async getStatus(): Promise<NetworkStatusResponse> {
    return this.request('/v1/network/status', { method: 'GET' });
  }

  async start(target: string): Promise<unknown> {
    return this.request('/v1/network/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target }),
    });
  }

  async stop(target: string): Promise<unknown> {
    return this.request('/v1/network/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target }),
    });
  }

  async restart(target: string): Promise<unknown> {
    return this.request('/v1/network/restart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target }),
    });
  }

  async getConfig(): Promise<NetworkConfigResponse> {
    return this.request('/v1/network/config', { method: 'GET' });
  }

  async updateConfig(assignments: string[]): Promise<NetworkConfigResponse> {
    return this.request('/v1/network/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignments }),
    });
  }

  async getLogs(target: string): Promise<{ logs: string[] }> {
    return this.request(`/v1/network/logs/${encodeURIComponent(target)}`, { method: 'GET' });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, withOperatorAuth(init, this.operatorToken));
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const body = await response.json() as ApiDataEnvelope<T>;
    return body.data;
  }
}

/**
 * Attach the operator token as an `Authorization: Bearer` header when one is
 * configured. The control-plane routes (`/v1/network`, `/api/*`) are gated by
 * the same operator token as chat/beast (see chat-app.ts), so first-party
 * clients must forward it or every secured request 401s. When no token is set
 * (loopback dev) the request is left untouched.
 *
 * `init.headers` may be a plain object, a `Headers` instance, or a
 * `[key, value][]` array (all valid `RequestInit` shapes). Object-spreading the
 * latter two would silently drop existing entries such as `Content-Type`, so we
 * normalize through `Headers` before setting the bearer token.
 */
export function withOperatorAuth(init: RequestInit, operatorToken: string | undefined): RequestInit {
  if (!operatorToken) {
    return init;
  }
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${operatorToken}`);
  return { ...init, headers };
}
