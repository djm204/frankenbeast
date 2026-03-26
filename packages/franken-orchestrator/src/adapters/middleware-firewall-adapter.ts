import type {
  IFirewallModule,
  FirewallResult,
  FirewallViolation,
} from '../deps.js';
import type { MiddlewareChain } from '../middleware/llm-middleware.js';
import { InjectionDetectedError } from '../middleware/injection-detection.js';

/**
 * Adapts MiddlewareChain (Phase 4) to the IFirewallModule port.
 * Runs injection detection + PII masking via beforeRequest().
 */
export class MiddlewareChainFirewallAdapter implements IFirewallModule {
  constructor(private readonly chain: MiddlewareChain) {}

  async runPipeline(input: string): Promise<FirewallResult> {
    try {
      const request = {
        systemPrompt: '',
        messages: [{ role: 'user' as const, content: input }],
      };
      const processed = this.chain.processRequest(request);
      const sanitizedText =
        typeof processed.messages[0]?.content === 'string'
          ? processed.messages[0].content
          : input;

      return {
        sanitizedText,
        violations: [],
        blocked: false,
      };
    } catch (err) {
      if (err instanceof InjectionDetectedError) {
        const violation: FirewallViolation = {
          rule: 'injection-detection',
          severity: 'block',
          detail: err.message,
        };
        return {
          sanitizedText: input,
          violations: [violation],
          blocked: true,
        };
      }
      throw err;
    }
  }
}
