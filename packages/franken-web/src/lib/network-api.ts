import type { ApiDataEnvelope, ApiErrorEnvelope, NetworkConfigResponse, NetworkStatusResponse } from '@franken/types';

export type { NetworkConfigResponse, NetworkStatusResponse } from '@franken/types';

const MAX_ERROR_BODY_CHARS = 2048;

function redactNetworkErrorSecrets(value: string): string {
  return value.replace(
    /("?(?:authorization|x-api-key|api-key|x-auth-token)"?\s*[:=]\s*)"?(?:bearer\s+|bot\s+)?[^\s,"'<>}]+"?/gi,
    '$1[REDACTED]',
  );
}

function truncateErrorBody(value: string): string {
  return value.length > MAX_ERROR_BODY_CHARS ? `${value.slice(0, MAX_ERROR_BODY_CHARS)}…` : value;
}

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
      throw await this.toError(path, response);
    }
    const body = await response.json() as ApiDataEnvelope<T>;
    return body.data;
  }

  private async toError(path: string, response: Response): Promise<NetworkApiError> {
    const statusText = response.statusText ? ` ${response.statusText}` : '';
    let responseBody = '';
    try {
      responseBody = (await response.text()).trim();
    } catch {
      responseBody = '';
    }

    if (responseBody) {
      try {
        const body = JSON.parse(responseBody) as ApiErrorEnvelope;
        const serverMessage = body.error?.message;
        if (serverMessage) {
          const code = body.error.code;
          const codeSuffix = code ? `, ${code}` : '';
          return new NetworkApiError(
            `${serverMessage} (HTTP ${response.status}${codeSuffix}) for ${path}`,
            response.status,
            code,
            body.error.details,
          );
        }
      } catch {
        // Fall through with raw response body context for malformed or non-JSON bodies.
      }
    }

    const bodySuffix = responseBody ? `: ${truncateErrorBody(redactNetworkErrorSecrets(responseBody))}` : '';
    return new NetworkApiError(`HTTP ${response.status}${statusText} for ${path}${bodySuffix}`, response.status);
  }
}
