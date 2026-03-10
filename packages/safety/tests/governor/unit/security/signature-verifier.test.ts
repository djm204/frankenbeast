import { describe, it, expect } from 'vitest';
import { SignatureVerifier } from '../../../../src/governor/security/signature-verifier.js';

describe('SignatureVerifier', () => {
  const secret = 'test-secret-key';
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

  it('sign + verify round-trip succeeds', () => {
    const payload = JSON.stringify({ requestId: 'req-001', decision: 'APPROVE' });
    const sig = verifier.sign(payload);
    expect(verifier.verify(payload, sig)).toBe(true);
  });

  it('produces deterministic signatures for same input', () => {
    const sig1 = verifier.sign('payload');
    const sig2 = verifier.sign('payload');
    expect(sig1).toBe(sig2);
  });
});
