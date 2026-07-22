const MAX_ERROR_BODY_CHARS = 2048;
const ERROR_BODY_READ_TIMEOUT_MS = 250;

function sanitizeHttpErrorUrl(value: string): string {
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

export function redactHttpErrorSecrets(value: string): string {
  return value
    .replace(/("(?:authorization|x-api-key|api-key|x-auth-token)"\s*:\s*)\[[^\]]*\]/gi, '$1["[REDACTED]"]')
    .replace(/("(?:authorization|x-api-key|api-key|x-auth-token)"\s*:\s*)\[[^\]\r\n,;<>}]*$/gim, '$1["[REDACTED]"]')
    .replace(/("(?:authorization|x-api-key|api-key|x-auth-token)"\s*:\s*)"[^"]*"/gi, '$1"[REDACTED]"')
    .replace(/("(?:authorization|x-api-key|api-key|x-auth-token)"\s*:\s*)"[^"\r\n,;<>}]*$/gim, '$1"[REDACTED]"')
    .replace(/(^|[\s;{])((?:authorization|x-api-key|api-key|x-auth-token)\s*[:=]\s*)[^\r\n,;<>}]+/gi, '$1$2[REDACTED]')
    .replace(/https?:\/\/[^\s"'<>]+/g, match => sanitizeHttpErrorUrl(match));
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

async function readBoundedErrorBody(response: Response): Promise<string> {
  if (!response.body || typeof response.body.getReader !== 'function') {
    return '';
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let truncated = false;
  const deadlineMs = Date.now() + ERROR_BODY_READ_TIMEOUT_MS;

  try {
    while (totalBytes < MAX_ERROR_BODY_CHARS) {
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
      const remainingBytes = MAX_ERROR_BODY_CHARS - totalBytes;
      if (value.byteLength > remainingBytes) {
        chunks.push(value.subarray(0, remainingBytes));
        totalBytes += remainingBytes;
        truncated = true;
        break;
      }
      chunks.push(value);
      totalBytes += value.byteLength;
    }
    if (truncated) {
      await reader.cancel();
    }
  } finally {
    reader.releaseLock();
  }

  const decoded = new TextDecoder().decode(concatChunks(chunks, totalBytes)).trim();
  return truncated ? `${decoded}…` : decoded;
}

function normalizeNumericProviderCode(value: unknown): string | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? String(value)
    : undefined;
}

function normalizeSlackErrorCode(value: unknown): string | undefined {
  return typeof value === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(value)
    ? value
    : undefined;
}

function extractProviderErrorCode(responseBody: string): string | undefined {
  try {
    const payload = JSON.parse(responseBody) as unknown;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return undefined;
    }

    const record = payload as Record<string, unknown>;
    const directCode = normalizeNumericProviderCode(record['error_code'])
      ?? normalizeNumericProviderCode(record['code'])
      ?? normalizeSlackErrorCode(record['error']);
    if (directCode) {
      return directCode;
    }

    const nestedError = record['error'];
    if (nestedError && typeof nestedError === 'object' && !Array.isArray(nestedError)) {
      return normalizeNumericProviderCode((nestedError as Record<string, unknown>)['code']);
    }
  } catch {
    // Malformed or truncated provider bodies are intentionally omitted.
  }
  return undefined;
}

export async function formatHttpErrorMessage(
  prefix: string,
  response: Response,
  endpoint: string,
  redact: (value: string) => string = redactHttpErrorSecrets,
): Promise<string> {
  const statusText = response.statusText ? ` ${response.statusText}` : '';
  const redactedEndpoint = redact(endpoint);
  let providerCode: string | undefined;

  try {
    providerCode = extractProviderErrorCode(await readBoundedErrorBody(response));
  } catch {
    providerCode = undefined;
  }

  const codeSuffix = providerCode ? ` (provider code: ${providerCode})` : '';
  return `${prefix}: ${response.status}${statusText} for ${redactedEndpoint}${codeSuffix}`;
}
