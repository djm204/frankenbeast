export async function formatHttpErrorMessage(
  prefix: string,
  response: Response,
  endpoint: string,
  redact: (value: string) => string = value => value,
): Promise<string> {
  const statusText = response.statusText ? ` ${response.statusText}` : '';
  const redactedEndpoint = redact(endpoint);
  let responseBody = '';

  try {
    responseBody = (await response.text()).trim();
  } catch {
    responseBody = '';
  }

  const bodySuffix = responseBody ? `: ${redact(responseBody)}` : '';
  return `${prefix}: ${response.status}${statusText} for ${redactedEndpoint}${bodySuffix}`;
}
