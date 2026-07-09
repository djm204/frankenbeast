import type { ApiDataEnvelope, ApiErrorEnvelope, NetworkConfigResponse, NetworkStatusResponse } from '@franken/types';

export type { NetworkConfigResponse, NetworkStatusResponse } from '@franken/types';

export class NetworkApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'NetworkApiError';
  }
}

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
      throw await this.toError(response);
    }
    const body = await response.json() as ApiDataEnvelope<T>;
    return body.data;
  }

  private async toError(response: Response): Promise<NetworkApiError> {
    const fallbackMessage = `HTTP ${response.status}`;
    try {
      const body = await response.json() as ApiErrorEnvelope;
      const serverMessage = body.error?.message;
      if (serverMessage) {
        const code = body.error.code;
        const codeSuffix = code ? `, ${code}` : '';
        return new NetworkApiError(
          `${serverMessage} (HTTP ${response.status}${codeSuffix})`,
          response.status,
          code,
          body.error.details,
        );
      }
    } catch {
      // Fall through with HTTP status message for empty, malformed, or non-JSON bodies.
    }
    return new NetworkApiError(fallbackMessage, response.status);
  }
}
