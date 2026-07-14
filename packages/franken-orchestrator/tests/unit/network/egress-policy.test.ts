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
      url: 'https://codeload.github.com/djm204/frankenbeast/zip/refs/heads/main',
      method: 'GET',
    })).toMatchObject({ allowed: true, destinationClass: 'github' });

    expect(evaluateEgressPolicy({
      lane: 'triage',
      url: 'https://api.github.com./repos/djm204/frankenbeast/issues/1739',
      method: 'GET',
    })).toMatchObject({ allowed: true, destinationClass: 'github', host: 'api.github.com' });

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

  it('rejects non-http schemes before host-based lane classification can allow them', () => {
    expect(evaluateEgressPolicy({
      lane: 'triage',
      url: 'ssh://github.com/djm204/frankenbeast',
      method: 'GET',
    })).toMatchObject({
      allowed: false,
      destinationClass: 'github',
      reason: 'scheme-not-allowed',
    });

    expect(evaluateEgressPolicy({
      lane: 'test',
      url: 'file://localhost/etc/passwd',
      method: 'GET',
    })).toMatchObject({
      allowed: false,
      reason: 'scheme-not-allowed',
    });
  });

  it('forces manual redirects and denies redirected destinations that violate lane policy', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: 'https://api.openai.com/v1/models' },
    }));
    const audit = vi.fn();
    const guardedFetch = createEgressGuardedFetch({ lane: 'triage', fetchImpl, audit });

    await expect(guardedFetch('https://github.com/djm204/frankenbeast')).rejects.toBeInstanceOf(EgressPolicyViolation);
    expect(fetchImpl).toHaveBeenCalledWith('https://github.com/djm204/frankenbeast', { redirect: 'manual' });
    expect(audit).toHaveBeenCalledWith({
      lane: 'triage',
      destinationClass: 'provider',
      host: 'api.openai.com',
      method: 'GET',
      allowed: false,
      reason: 'destination-class-not-allowed',
    });
  });

  it('does not replay methods, bodies, or headers when an allowed redirect is returned', async () => {
    const redirectResponse = new Response(null, {
      status: 302,
      headers: { location: 'https://codeload.github.com/djm204/frankenbeast/zip/refs/heads/main' },
    });
    const fetchImpl = vi.fn(async () => redirectResponse);
    const guardedFetch = createEgressGuardedFetch({ lane: 'implementation', fetchImpl });

    await expect(guardedFetch('https://github.com/djm204/frankenbeast', {
      method: 'POST',
      body: 'sensitive payload',
      headers: { Authorization: 'Bearer secret' },
    })).resolves.toBe(redirectResponse);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('honors redirect error mode by rejecting after a redirect response', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: 'https://codeload.github.com/djm204/frankenbeast/zip/refs/heads/main?token=secret' },
    }));
    const guardedFetch = createEgressGuardedFetch({ lane: 'implementation', fetchImpl });

    await expect(guardedFetch('https://github.com/djm204/frankenbeast', { redirect: 'error' })).rejects.toBeInstanceOf(TypeError);
    await expect(guardedFetch(new Request('https://github.com/djm204/frankenbeast', { redirect: 'error' }))).rejects.toBeInstanceOf(TypeError);
    await expect(guardedFetch('https://github.com/djm204/frankenbeast', { redirect: 'error' })).rejects.toThrow(
      'GET github:codeload.github.com',
    );
    await expect(guardedFetch('https://github.com/djm204/frankenbeast', { redirect: 'error' })).rejects.not.toThrow(
      /token|secret|zip\/refs/u,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(4);
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
