const REDACTED = '[REDACTED]';

/**
 * Redacts Telegram bot-token path segments before strings are logged, rendered in
 * error messages, or surfaced through HTTP error paths. Telegram embeds bot
 * tokens in URLs as either `/bot<token>/...` API paths or webhook path segments.
 */
export function redactTelegramBotTokenUrls(input: string): string {
  return input
    .replace(
      /(api\.telegram\.org\/bot)\d{5,}(?::|%3A)[A-Za-z0-9_-]{20,}/gi,
      `$1${REDACTED}`,
    )
    .replace(
      /(\/bot)\d{5,}(?::|%3A)[A-Za-z0-9_-]{20,}(?=\/|$|[?#\s"'<>])/gi,
      `$1${REDACTED}`,
    )
    .replace(
      /(\/webhooks\/telegram\/)\d{5,}(?::|%3A)[A-Za-z0-9_-]{20,}(?=\/|$|[?#\s"'<>])/gi,
      `$1${REDACTED}`,
    );
}
