import type { ApiDataEnvelope, NetworkConfigResponse, NetworkStatusResponse } from '@franken/types';

export type { NetworkConfigResponse, NetworkStatusResponse } from '@franken/types';

export class NetworkApiClient {
  constructor(private readonly baseUrl: string) {}

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
    const response = await fetch(`${this.baseUrl}${path}`, init);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const body = await response.json() as ApiDataEnvelope<T>;
    return body.data;
  }
}
