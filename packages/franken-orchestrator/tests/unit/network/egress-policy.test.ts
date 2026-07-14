import { describe, expect, it, vi } from 'vitest';
import {
  EgressPolicyViolation,
  createEgressGuardedFetch,
  defaultLaneEgressPolicies,
  evaluateEgressPolicy,
  redactEgressDecisionForLog,
} from '../../../src/network/egress-policy.js';
import { NetworkConfigSchema } from '../../../src/network/network-config.js';

describe('lane egress policy', () => {
  it('maps worker lanes to separated destination classes and methods', () => {
    expect(defaultLaneEgressPolicies.docs.allowedDestinationClasses).toEqual(['github', 'local']);
    expect(defaultLaneEgressPolicies.triage.allowedDestinationClasses).toEqual(['github', 'local']);
    expect(defaultLaneEgressPolicies.fallback.allowedDestinationClasses).toEqual(['github', 'provider', 'local']);
    expect(defaultLaneEgressPolicies.operator.allowedDestinationClasses).toContain('messaging');
    expect(defaultLaneEgressPolicies.docs.allowedMethods).toEqual(['GET', 'HEAD']);
  });

  it('allows low-risk lanes to reach GitHub without allowing provider access', () => {
    expect(evaluateEgressPolicy({
      lane: 'triage',
      url: 'https://api.github.com/repos/djm204/frankenbeast/issues/1739',
      method: 'GET',
    })).toMatchObject({ allowed: true, destinationClass: 'github' });

    expect(evaluateEgressPolicy({
      lane: 'triage',
      url: 'https://api.openai.com/v1/models',
      method: 'GET',
    })).toMatchObject({
      allowed: false,
      destinationClass: 'provider',
      reason: 'destination-class-not-allowed',
    });
  });

  it('allows fallback lanes to reach model providers without allowing arbitrary web hosts', () => {
    expect(evaluateEgressPolicy({
      lane: 'fallback',
      url: 'https://api.anthropic.com/v1/messages',
      method: 'POST',
    })).toMatchObject({ allowed: true, destinationClass: 'provider' });

    expect(evaluateEgressPolicy({
      lane: 'fallback',
      url: 'https://example.com/collect?secret=do-not-log',
      method: 'POST',
    })).toMatchObject({
      allowed: false,
      destinationClass: 'arbitrary',
      reason: 'destination-class-not-allowed',
    });
  });

  it('allows explicit per-call override while recording the override reason', () => {
    expect(evaluateEgressPolicy({
      lane: 'docs',
      url: 'https://example.com/research',
      method: 'POST',
      override: { allow: true, reason: 'operator-approved research fixture' },
    })).toMatchObject({
      allowed: true,
      destinationClass: 'arbitrary',
      reason: 'explicit-override: operator-approved research fixture',
    });
  });

  it('logs denied egress evidence without payload secrets or URL paths', () => {
    const decision = evaluateEgressPolicy({
      lane: 'test',
      url: 'https://example.com/path/with/token?api_key=secret',
      method: 'POST',
    });

    const log = redactEgressDecisionForLog(decision);
    expect(log).toEqual({
      lane: 'test',
      destinationClass: 'arbitrary',
      host: 'example.com',
      method: 'POST',
      allowed: false,
      reason: 'destination-class-not-allowed',
    });
    expect(JSON.stringify(log)).not.toContain('token');
    expect(JSON.stringify(log)).not.toContain('secret');
  });

  it('wraps fetch and denies unexpected egress before the request is sent', async () => {
    const fetchImpl = vi.fn(async () => new Response('ok'));
    const audit = vi.fn();
    const guardedFetch = createEgressGuardedFetch({ lane: 'docs', fetchImpl, audit });

    await expect(guardedFetch('https://example.com/exfiltrate', { method: 'POST' })).rejects.toBeInstanceOf(EgressPolicyViolation);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(audit).toHaveBeenCalledWith({
      lane: 'docs',
      destinationClass: 'arbitrary',
      host: 'example.com',
      method: 'POST',
      allowed: false,
      reason: 'method-not-allowed',
    });
  });

  it('accepts config-level lane overrides for approved services', () => {
    const config = NetworkConfigSchema.parse({
      network: {
        egressPolicy: {
          lanes: {
            docs: {
              allowedDomains: ['docs.example.org'],
              allowedMethods: ['GET'],
            },
          },
        },
      },
    });

    expect(evaluateEgressPolicy({
      lane: 'docs',
      url: 'https://docs.example.org/reference',
      method: 'GET',
      policy: config.network.egressPolicy,
    })).toMatchObject({ allowed: true, destinationClass: 'arbitrary' });

    expect(evaluateEgressPolicy({
      lane: 'docs',
      url: 'https://docs.example.org/reference',
      method: 'POST',
      policy: config.network.egressPolicy,
    })).toMatchObject({ allowed: false, reason: 'method-not-allowed' });
  });
});
