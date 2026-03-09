export function sanitizeChatOutput(text: string): string {
  let cleaned = text;

  cleaned = cleaned.replace(/Web search results for query:.*\n\n?Links:\s*\[[\s\S]*?\]\n*/gi, '');
  cleaned = cleaned.replace(/\n*REMINDER:[\s\S]*$/gi, '');

  return cleaned.trim();
}
