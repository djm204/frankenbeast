import { describe, expect, it } from 'vitest';
import {
  createEvaluatorsFromApprovalPolicyManifest,
  formatApprovalPolicyManifestPayload,
  verifySignedApprovalPolicyManifest,
  type ApprovalPolicyManifest,
} from '../../../src/security/approval-policy-manifest.js';
import { SignatureVerifier } from '../../../src/security/signature-verifier.js';

describe('signed approval policy manifests', () => {
  const verifier = new SignatureVerifier('policy-fixture-secret');

  function signManifest(manifest: Omit<ApprovalPolicyManifest, 'signature'>): ApprovalPolicyManifest {
    const signatureMetadata = { algorithm: 'hmac-sha256' as const, keyId: 'test-key', value: '' };
    return {
      ...manifest,
      signature: {
        ...signatureMetadata,
        value: verifier.sign(formatApprovalPolicyManifestPayload({ ...manifest, signature: signatureMetadata })),
      },
    };
  }

  it('formats manifests deterministically without including the signature bytes', () => {
    const manifest = signManifest({
      schemaVersion: 1,
      manifestId: 'approval-policy/default',
      issuedAt: '2026-07-13T00:00:00.000Z',
      policies: [
        { triggerId: 'skill' },
        { triggerId: 'confidence', config: { threshold: 0.72 } },
      ],
    });

    expect(formatApprovalPolicyManifestPayload(manifest)).toBe(
      '{"issuedAt":"2026-07-13T00:00:00.000Z","manifestId":"approval-policy/default","policies":[{"triggerId":"skill"},{"config":{"threshold":0.72},"triggerId":"confidence"}],"schemaVersion":1,"signature":{"algorithm":"hmac-sha256","keyId":"test-key"}}',
    );
  });

  it('verifies a signed manifest and builds evaluators in manifest order', () => {
    const manifest = signManifest({
      schemaVersion: 1,
      manifestId: 'approval-policy/default',
      issuedAt: '2026-07-13T00:00:00.000Z',
      policies: [
        { triggerId: 'skill' },
        { triggerId: 'confidence', config: { threshold: 0.8 } },
      ],
    });

    expect(verifySignedApprovalPolicyManifest(manifest, { verifier })).toMatchObject({
      manifestId: 'approval-policy/default',
      signed: true,
      signatureKeyId: 'test-key',
    });

    const evaluators = createEvaluatorsFromApprovalPolicyManifest(manifest, { verifier });
    expect(evaluators.map((evaluator) => evaluator.triggerId)).toEqual(['skill', 'confidence']);
    expect(evaluators[1]!.evaluate({ confidenceScore: 0.7 })).toMatchObject({
      triggered: true,
      reason: 'Low confidence: score 0.7 below threshold 0.8',
    });
  });

  it('fails closed for unsigned manifests unless an explicit operator override is set', () => {
    const manifest: ApprovalPolicyManifest = {
      schemaVersion: 1,
      manifestId: 'approval-policy/unsigned',
      issuedAt: '2026-07-13T00:00:00.000Z',
      policies: [{ triggerId: 'budget' }],
    };

    expect(() => verifySignedApprovalPolicyManifest(manifest, { verifier })).toThrow(
      'Approval policy manifest approval-policy/unsigned is unsigned',
    );
    expect(createEvaluatorsFromApprovalPolicyManifest(manifest, { verifier, allowUnsigned: true })[0]!.triggerId)
      .toBe('budget');
  });

  it('rejects tampered or unsupported policy manifests without exposing secret material', () => {
    const manifest = signManifest({
      schemaVersion: 1,
      manifestId: 'approval-policy/tamper',
      issuedAt: '2026-07-13T00:00:00.000Z',
      policies: [{ triggerId: 'ambiguity' }],
    });
    const tampered: ApprovalPolicyManifest = {
      ...manifest,
      policies: [{ triggerId: 'confidence', config: { threshold: 0.2 } }],
    };

    expect(() => verifySignedApprovalPolicyManifest(tampered, { verifier })).toThrow(
      'Approval policy manifest approval-policy/tamper signature verification failed',
    );
    expect(() => createEvaluatorsFromApprovalPolicyManifest({
      ...manifest,
      signature: { algorithm: 'ed25519', value: 'not-supported' },
    }, { verifier })).toThrow('Unsupported approval policy manifest signature algorithm: ed25519');
  });

  it('authenticates key ids as signature metadata', () => {
    const manifest = signManifest({
      schemaVersion: 1,
      manifestId: 'approval-policy/keyid',
      issuedAt: '2026-07-13T00:00:00.000Z',
      policies: [{ triggerId: 'budget' }],
    });

    expect(() => verifySignedApprovalPolicyManifest({
      ...manifest,
      signature: { ...manifest.signature!, keyId: 'spoofed-key' },
    }, { verifier })).toThrow('Approval policy manifest approval-policy/keyid signature verification failed');
  });

  it('rejects unknown trigger IDs and unknown confidence config keys from JSON manifests', () => {
    const unknownTrigger = signManifest({
      schemaVersion: 1,
      manifestId: 'approval-policy/unknown-trigger',
      issuedAt: '2026-07-13T00:00:00.000Z',
      policies: [{ triggerId: 'confidnce' as 'confidence' }],
    });
    expect(() => createEvaluatorsFromApprovalPolicyManifest(unknownTrigger, { verifier })).toThrow(
      'Unsupported approval policy triggerId: confidnce',
    );

    const typoConfig = signManifest({
      schemaVersion: 1,
      manifestId: 'approval-policy/typo-config',
      issuedAt: '2026-07-13T00:00:00.000Z',
      policies: [{ triggerId: 'confidence', config: { threshhold: 0.9 } as { threshold: number } }],
    });
    expect(() => createEvaluatorsFromApprovalPolicyManifest(typoConfig, { verifier })).toThrow(
      'Unsupported confidence policy config key: threshhold',
    );
  });
});
