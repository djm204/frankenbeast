const MAX_ERROR_BODY_CHARS = 2048;

export function redactHttpErrorSecrets(value: string): string {
  return value.replace(
    /("?(?:authorization|x-api-key|api-key|x-auth-token)"?\s*[:=]\s*)"?(?:bearer\s+|bot\s+)?[^\s,"'<>}]+"?/gi,
    '$1[REDACTED]',
  );
}

function truncateErrorBody(value: string): string {
  return value.length > MAX_ERROR_BODY_CHARS ? `${value.slice(0, MAX_ERROR_BODY_CHARS)}…` : value;
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
    responseBody = (await response.text()).trim();
  } catch {
    responseBody = '';
  }

  const bodySuffix = responseBody ? `: ${truncateErrorBody(redact(responseBody))}` : '';
  return `${prefix}: ${response.status}${statusText} for ${redactedEndpoint}${bodySuffix}`;
}
