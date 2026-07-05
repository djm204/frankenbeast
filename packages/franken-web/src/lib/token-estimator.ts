export const TOKEN_ESTIMATION_CHARS_PER_TOKEN = 4;
export const GOOD_CONTEXT_TOKEN_LIMIT = 4_000;
export const WARNING_CONTEXT_TOKEN_LIMIT = 16_000;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / TOKEN_ESTIMATION_CHARS_PER_TOKEN);
}

export type ContextHealth = 'good' | 'warning' | 'critical';

export function getContextHealth(tokens: number): ContextHealth {
  if (tokens < GOOD_CONTEXT_TOKEN_LIMIT) return 'good';
  if (tokens < WARNING_CONTEXT_TOKEN_LIMIT) return 'warning';
  return 'critical';
}
