import { createHash } from 'node:crypto';
import type { BeastRateLimitOptions } from '../beasts/http/beast-rate-limit.js';

export const DEFAULT_CHAT_RATE_LIMIT: BeastRateLimitOptions = { windowMs: 60_000, max: 20 };

export function hashChatRateLimitPrincipal(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}

export function chatRateLimitPrincipalFromAddress(address: string | undefined): string {
  const normalized = address?.trim();
  return normalized ? `ip:${hashChatRateLimitPrincipal(normalized)}` : 'anonymous';
}
