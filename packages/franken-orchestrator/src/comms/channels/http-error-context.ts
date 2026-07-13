const MAX_ERROR_BODY_CHARS = 2048;

export function redactHttpErrorSecrets(value: string): string {
  return value
    .replace(/("(?:authorization|x-api-key|api-key|x-auth-token)"\s*:\s*)"[^"]*"/gi, '$1"[REDACTED]"')
    .replace(/("(?:authorization|x-api-key|api-key|x-auth-token)"\s*:\s*)"[^"\r\n,;<>}]*$/gim, '$1"[REDACTED]"')
    .replace(/(^|[\s;])((?:authorization|x-api-key|api-key|x-auth-token)\s*[:=]\s*)[^\r\n,;<>}]+/gi, '$1$2[REDACTED]');
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

async function readBoundedErrorBody(response: Response): Promise<string> {
  if (!response.body || typeof response.body.getReader !== 'function') {
    return '';
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (totalBytes < MAX_ERROR_BODY_CHARS) {
      const { value, done } = await reader.read();
      if (done || !value) {
        break;
      }
      const remainingBytes = MAX_ERROR_BODY_CHARS - totalBytes;
      const boundedChunk = value.byteLength > remainingBytes ? value.subarray(0, remainingBytes) : value;
      chunks.push(boundedChunk);
      totalBytes += boundedChunk.byteLength;
    }
    if (totalBytes >= MAX_ERROR_BODY_CHARS) {
      await reader.cancel();
    }
  } finally {
    reader.releaseLock();
  }

  const decoded = new TextDecoder().decode(concatChunks(chunks, totalBytes)).trim();
  return totalBytes >= MAX_ERROR_BODY_CHARS ? `${decoded}…` : decoded;
}

export async function formatHttpErrorMessage(
  prefix: string,
  response: Response,
  endpoint: string,
  redact: (value: string) => string = redactHttpErrorSecrets,
): Promise<string> {
  const statusText = response.statusText ? ` ${response.statusText}` : '';
  const redactedEndpoint = redact(endpoint);
  let responseBody = '';

  try {
    responseBody = await readBoundedErrorBody(response);
  } catch {
    responseBody = '';
  }

  const bodySuffix = responseBody ? `: ${redact(responseBody)}` : '';
  return `${prefix}: ${response.status}${statusText} for ${redactedEndpoint}${bodySuffix}`;
}
