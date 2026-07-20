import { describe, expect, it } from 'vitest';
import { MiddlewareChainFirewallAdapter } from '../../../src/adapters/middleware-firewall-adapter.js';
import { CustomRuleMiddleware } from '../../../src/middleware/custom-rule.js';
import { MiddlewareChain } from '../../../src/middleware/llm-middleware.js';

describe('MiddlewareChainFirewallAdapter response scanning', () => {
  it('runs response-target middleware when scanning untrusted outputs', async () => {
    const chain = new MiddlewareChain();
    chain.add(new CustomRuleMiddleware({
      name: 'response-secret',
      pattern: 'response-only-secret',
      action: 'block',
      target: 'response',
    }));
    const firewall = new MiddlewareChainFirewallAdapter(chain);

    const requestResult = await firewall.runPipeline('response-only-secret');
    const responseResult = await firewall.scanResponse('response-only-secret');

    expect(requestResult.blocked).toBe(false);
    expect(responseResult.blocked).toBe(true);
    expect(responseResult.violations[0]?.rule).toBe('custom:response-secret');
  });
});
