/**
 * Fake LLM adapter for E2E testing.
 * Supports pattern-to-response mapping, call tracking, latency injection, and error injection.
 */

export interface FakeLlmCall {
  readonly prompt: string;
  readonly timestamp: number;
}

export interface FakeLlmOptions {
  /** Pattern → response mappings. First match wins. */
  patterns?: Array<{ match: RegExp | string; response: string }>;
  /** Default response when no pattern matches. */
  defaultResponse?: string;
  /** Artificial latency in ms (applied per call). */
  latencyMs?: number;
  /** If set, throws this error on the Nth call (1-indexed). */
  errorOnCall?: { callNumber: number; error: Error };
}

export class FakeLlmAdapter {
  private readonly patterns: Array<{ match: RegExp | string; response: string }>;
  private readonly defaultResponse: string;
  private readonly latencyMs: number;
  private readonly errorOnCall?: { callNumber: number; error: Error };

  readonly calls: FakeLlmCall[] = [];

  constructor(options: FakeLlmOptions = {}) {
    this.patterns = options.patterns ?? [];
    this.defaultResponse = options.defaultResponse ?? 'OK';
    this.latencyMs = options.latencyMs ?? 0;
    this.errorOnCall = options.errorOnCall;
  }

  /** Simulate an LLM call. */
  async complete(prompt: string): Promise<string> {
    this.calls.push({ prompt, timestamp: Date.now() });

    if (this.errorOnCall && this.calls.length === this.errorOnCall.callNumber) {
      throw this.errorOnCall.error;
    }

    if (this.latencyMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.latencyMs));
    }

    for (const { match, response } of this.patterns) {
      if (typeof match === 'string') {
        if (prompt.includes(match)) return response;
      } else {
        if (match.test(prompt)) return response;
      }
    }

    return this.defaultResponse;
  }

  /** Reset call tracking. */
  reset(): void {
    this.calls.length = 0;
  }

  /** Number of calls made. */
  get callCount(): number {
    return this.calls.length;
  }
}
