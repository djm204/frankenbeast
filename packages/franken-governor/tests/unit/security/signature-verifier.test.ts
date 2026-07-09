import { describe, it, expect } from 'vitest';
import {
  formatApprovalResponseSignaturePayload,
  SignatureVerifier,
} from '../../../src/security/signature-verifier.js';

describe('SignatureVerifier', () => {
  const secret = ['test', 'signing', 'fixture'].join('-');
  const verifier = new SignatureVerifier(secret);

  it('sign() produces a hex-encoded string', () => {
    const sig = verifier.sign('hello');
    expect(sig).toMatch(/^[0-9a-f]+$/);
  });

  it('verify() returns true for valid signature', () => {
    const payload = 'some-payload';
    const sig = verifier.sign(payload);
    expect(verifier.verify(payload, sig)).toBe(true);
  });

  it('verify() returns false for tampered payload', () => {
    const sig = verifier.sign('original');
    expect(verifier.verify('tampered', sig)).toBe(false);
  });

  it('verify() returns false for wrong secret', () => {
    const otherVerifier = new SignatureVerifier('other-secret');
    const sig = verifier.sign('payload');
    expect(otherVerifier.verify('payload', sig)).toBe(false);
  });

  it('verify() returns false instead of throwing for a 64-character non-hex signature', () => {
    expect(() => verifier.verify('payload', 'z'.repeat(64))).not.toThrow();
    expect(verifier.verify('payload', 'z'.repeat(64))).toBe(false);
  });

  it('sign + verify round-trip succeeds for approval response payloads', () => {
    const payload = formatApprovalResponseSignaturePayload({
      requestId: 'req-001',
      decision: 'APPROVE',
      respondedBy: 'human',
    });
    const sig = verifier.sign(payload);
    expect(verifier.verify(payload, sig)).toBe(true);
  });

  it('formats approval response payloads without relying on JSON key order', () => {
    expect(formatApprovalResponseSignaturePayload({
      requestId: 'req-001',
      decision: 'APPROVE',
      respondedBy: 'human@example.com',
      feedback: 'ship it',
    }))
      .toBe('requestId:req-001|decision:APPROVE|respondedBy:human%40example.com|feedback:s:ship%20it');
  });

  it('distinguishes absent feedback from literal feedback values', () => {
    expect(formatApprovalResponseSignaturePayload({
      requestId: 'req-001',
      decision: 'APPROVE',
      respondedBy: 'human',
    }))
      .toBe('requestId:req-001|decision:APPROVE|respondedBy:human|feedback:u');
    expect(formatApprovalResponseSignaturePayload({
      requestId: 'req-001',
      decision: 'APPROVE',
      respondedBy: 'human',
      feedback: '',
    }))
      .toBe('requestId:req-001|decision:APPROVE|respondedBy:human|feedback:s:');
  });

  it('produces deterministic signatures for same input', () => {
    const sig1 = verifier.sign('payload');
    const sig2 = verifier.sign('payload');
    expect(sig1).toBe(sig2);
  });
});
