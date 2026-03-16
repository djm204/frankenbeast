export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export type ContextHealth = 'good' | 'warning' | 'critical';

export function getContextHealth(tokens: number): ContextHealth {
  if (tokens < 4000) return 'good';
  if (tokens < 16000) return 'warning';
  return 'critical';
}
