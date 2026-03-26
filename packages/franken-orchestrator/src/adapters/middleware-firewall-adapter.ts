import type {
  IFirewallModule,
  FirewallResult,
  FirewallViolation,
} from '../deps.js';
import type { MiddlewareChain } from '../middleware/llm-middleware.js';
import { InjectionDetectedError } from '../middleware/injection-detection.js';
import { DomainBlockedError } from '../middleware/domain-allowlist.js';
import { CustomRuleError } from '../middleware/custom-rule.js';

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
      // Convert all known middleware blocking errors into FirewallResult
      if (err instanceof InjectionDetectedError) {
        return {
          sanitizedText: input,
          violations: [{ rule: 'injection-detection', severity: 'block', detail: err.message }],
          blocked: true,
        };
      }
      if (err instanceof DomainBlockedError) {
        return {
          sanitizedText: input,
          violations: [{ rule: 'domain-allowlist', severity: 'block', detail: err.message }],
          blocked: true,
        };
      }
      if (err instanceof CustomRuleError) {
        return {
          sanitizedText: input,
          violations: [{ rule: `custom:${err.ruleName}`, severity: 'block', detail: err.message }],
          blocked: true,
        };
      }
      // Unknown errors still become blocks with structured reporting
      const message = err instanceof Error ? err.message : String(err);
      return {
        sanitizedText: input,
        violations: [{ rule: 'middleware-error', severity: 'block', detail: message }],
        blocked: true,
      };
    }
  }
}
