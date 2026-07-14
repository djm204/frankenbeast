import { createHash } from 'node:crypto';
import { InMemoryRateLimiter, type BeastRateLimitOptions } from '../beasts/http/beast-rate-limit.js';

export type ChatRateLimitOptions = BeastRateLimitOptions;

export const DEFAULT_CHAT_RATE_LIMIT: ChatRateLimitOptions = { windowMs: 60_000, max: 20 };

export function createChatRateLimiter(options: ChatRateLimitOptions = DEFAULT_CHAT_RATE_LIMIT): InMemoryRateLimiter {
  return new InMemoryRateLimiter(options);
}

export function hashChatRateLimitPrincipal(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}

export function chatRateLimitPrincipalFromAddress(address: string | undefined): string {
  const normalized = address?.trim();
  return normalized ? `ip:${hashChatRateLimitPrincipal(normalized)}` : 'anonymous';
}

export function chatRateLimitPrincipal(parts: {
  readonly operatorToken?: string | undefined;
  readonly remoteAddress?: string | undefined;
  readonly principal?: string | undefined;
}): string {
  const explicitPrincipal = parts.principal?.trim();
  if (explicitPrincipal) {
    return `principal:${hashChatRateLimitPrincipal(explicitPrincipal)}`;
  }

  const operatorToken = parts.operatorToken?.trim();
  if (operatorToken) {
    return `operator:${hashChatRateLimitPrincipal(operatorToken)}`;
  }

  return chatRateLimitPrincipalFromAddress(parts.remoteAddress);
}

export function chatClientKey(parts: {
  readonly action: 'message' | 'approval';
  readonly sessionId?: string | undefined;
  readonly operatorToken?: string | undefined;
  readonly remoteAddress?: string | undefined;
  readonly principal?: string | undefined;
}): string {
  return `chat:${parts.action}:${chatRateLimitPrincipal(parts)}`;
}

export function chatMutationKey(sessionId: string): string {
  return `session:${sessionId}`;
}

export class ChatMutationAdmission {
  private readonly inFlightMutations = new Set<string>();

  constructor(private readonly limiter: InMemoryRateLimiter) {}

  takeRateLimit(key: string): boolean {
    return this.limiter.take(key).allowed;
  }

  begin(sessionId: string): boolean {
    const mutationKey = chatMutationKey(sessionId);
    if (this.inFlightMutations.has(mutationKey)) {
      return false;
    }
    this.inFlightMutations.add(mutationKey);
    return true;
  }

  end(sessionId: string): void {
    this.inFlightMutations.delete(chatMutationKey(sessionId));
  }
}
