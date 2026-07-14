import type { ApiDataEnvelope, ApiErrorEnvelope, NetworkConfigResponse, NetworkStatusResponse } from '@franken/types';

export type { NetworkConfigResponse, NetworkStatusResponse } from '@franken/types';

const MAX_ERROR_BODY_CHARS = 2048;
const MAX_STRUCTURED_ERROR_BODY_CHARS = 65_536;
const ERROR_BODY_READ_TIMEOUT_MS = 250;

function sanitizeBodyUrl(value: string): string {
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    if (url.hostname === 'hooks.slack.com') {
      url.pathname = '/services/[REDACTED]';
    } else {
      url.pathname = url.pathname
        .split('/')
        .map(segment => {
          if (!segment) {
            return segment;
          }
          if (/^bot.+/i.test(segment)) {
            return '[REDACTED]';
          }
          return segment;
        })
        .join('/');
    }
    return url.toString();
  } catch {
    return '[REDACTED]';
  }
}

function redactNetworkErrorSecrets(value: string): string {
  return value
    .replace(/("(?:authorization|x-api-key|api-key|x-auth-token)"\s*:\s*)\[[^\]]*\]/gi, '$1["[REDACTED]"]')
    .replace(/("(?:authorization|x-api-key|api-key|x-auth-token)"\s*:\s*)\[[^\]\r\n,;<>}]*$/gim, '$1["[REDACTED]"]')
    .replace(/("(?:authorization|x-api-key|api-key|x-auth-token)"\s*:\s*)"[^"]*"/gi, '$1"[REDACTED]"')
    .replace(/("(?:authorization|x-api-key|api-key|x-auth-token)"\s*:\s*)"[^"\r\n,;<>}]*$/gim, '$1"[REDACTED]"')
    .replace(/(^|[\s;{])((?:authorization|x-api-key|api-key|x-auth-token)\s*[:=]\s*)[^\r\n,;<>}]+/gi, '$1$2[REDACTED]')
    .replace(/https?:\/\/[^\s"'<>]+/g, match => sanitizeBodyUrl(match));
}

function concatChunks(chunks: Uint8Array[], totalBytes: number): Uint8Array {
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function readWithDeadline(reader: ReadableStreamDefaultReader<Uint8Array>, timeoutMs: number) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ done: true; value?: undefined; timedOut: true }>(resolve => {
    timeoutId = setTimeout(() => resolve({ done: true, timedOut: true }), timeoutMs);
  });
  return Promise.race([
    reader.read().then(read => ({ ...read, timedOut: false as const })),
    timeout,
  ]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
}

async function readBoundedErrorBody(
  response: Response,
  maxChars = MAX_ERROR_BODY_CHARS,
  options: { cancelOnTruncate?: boolean } = {},
): Promise<string> {
  if (!response.body || typeof response.body.getReader !== 'function') {
    return '';
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let truncated = false;
  const deadlineMs = Date.now() + ERROR_BODY_READ_TIMEOUT_MS;

  try {
    while (totalBytes < maxChars) {
      const remainingMs = deadlineMs - Date.now();
      if (remainingMs <= 0) {
        truncated = true;
        break;
      }
      const { value, done, timedOut } = await readWithDeadline(reader, remainingMs);
      if (timedOut) {
        truncated = true;
        break;
      }
      if (done || !value) {
        break;
      }
      const remainingBytes = maxChars - totalBytes;
      if (value.byteLength > remainingBytes) {
        chunks.push(value.subarray(0, remainingBytes));
        totalBytes += remainingBytes;
        truncated = true;
        break;
      }
      chunks.push(value);
      totalBytes += value.byteLength;
      if (totalBytes >= maxChars) {
        truncated = true;
        break;
      }
    }
    if (truncated && options.cancelOnTruncate !== false) {
      await reader.cancel();
    }
  } finally {
    reader.releaseLock();
  }

  const decoded = new TextDecoder().decode(concatChunks(chunks, totalBytes)).trim();
  return truncated ? `${decoded}…` : decoded;
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
    const structuredError = await this.parseStructuredError(response);
    const serverMessage = structuredError?.error?.message;
    if (serverMessage) {
      const code = structuredError.error.code;
      const codeSuffix = code ? `, ${code}` : '';
      return new NetworkApiError(
        `${serverMessage} (HTTP ${response.status}${codeSuffix}) for ${path}`,
        response.status,
        code,
        structuredError.error.details,
      );
    }

    let responseBody = '';
    try {
      responseBody = await readBoundedErrorBody(response);
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

    const bodySuffix = responseBody ? `: ${redactNetworkErrorSecrets(responseBody)}` : '';
    return new NetworkApiError(`HTTP ${response.status}${statusText} for ${path}${bodySuffix}`, response.status);
  }

  private async parseStructuredError(response: Response): Promise<ApiErrorEnvelope | null> {
    if (typeof response.clone !== 'function') {
      const jsonOnlyResponse = response as { json?: () => Promise<unknown> };
      if (typeof jsonOnlyResponse.json !== 'function') {
        return null;
      }
      try {
        return await jsonOnlyResponse.json() as ApiErrorEnvelope;
      } catch {
        return null;
      }
    }
    const contentType = response.headers?.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('json')) {
      return null;
    }
    try {
      const body = await readBoundedErrorBody(response.clone(), MAX_STRUCTURED_ERROR_BODY_CHARS, { cancelOnTruncate: false });
      return body && !body.endsWith('…') ? JSON.parse(body) as ApiErrorEnvelope : null;
    } catch {
      return null;
    }
  }
}
