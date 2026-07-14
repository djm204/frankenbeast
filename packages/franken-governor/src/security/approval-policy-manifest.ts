import { ApprovalConfigurationError, SignatureVerificationError } from '../errors/index.js';
import { AmbiguityTrigger } from '../triggers/ambiguity-trigger.js';
import { BudgetTrigger } from '../triggers/budget-trigger.js';
import { ConfidenceTrigger } from '../triggers/confidence-trigger.js';
import { SkillTrigger } from '../triggers/skill-trigger.js';
import type { TriggerEvaluator } from '../triggers/trigger-evaluator.js';
import type { SignatureVerifier } from './signature-verifier.js';

export type ApprovalPolicyTriggerId = 'skill' | 'budget' | 'confidence' | 'ambiguity';
export type ApprovalPolicyManifestTriggerId = ApprovalPolicyTriggerId;

export interface ApprovalPolicyManifestSignature {
  readonly algorithm: 'hmac-sha256';
  readonly value: string;
  readonly keyId?: string;
}

export interface ApprovalPolicyManifestPolicy {
  readonly triggerId: ApprovalPolicyTriggerId;
  readonly enabled?: boolean;
  readonly config?: {
    readonly threshold?: number;
  };
}

export interface ApprovalPolicyManifest {
  readonly schemaVersion: 1;
  readonly manifestId: string;
  readonly issuedAt: string;
  readonly policies: ReadonlyArray<ApprovalPolicyManifestPolicy>;
  readonly signature?: ApprovalPolicyManifestSignature;
}

export interface VerifiedApprovalPolicyManifest {
  readonly manifestId: string;
  readonly signed: boolean;
  readonly signatureKeyId?: string;
}

export interface ApprovalPolicyManifestVerificationOptions {
  readonly verifier?: SignatureVerifier;
  /**
   * Explicit operator override for development/test fixtures. Production callers
   * should leave this false so manifest loading fails closed when unsigned.
   */
  readonly allowUnsigned?: boolean;
}

type JsonValue = string | number | boolean | null | JsonValue[] | { readonly [key: string]: JsonValue };

function stableJson(value: JsonValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;

  const entries = Object.entries(value)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableJson(entryValue)}`).join(',')}}`;
}

function manifestPayloadShape(manifest: ApprovalPolicyManifest | Omit<ApprovalPolicyManifest, 'signature'>): JsonValue {
  const signature = 'signature' in manifest ? manifest.signature : undefined;
  return {
    schemaVersion: manifest.schemaVersion,
    manifestId: manifest.manifestId,
    issuedAt: manifest.issuedAt,
    policies: manifest.policies.map((policy) => ({
      triggerId: policy.triggerId,
      ...(policy.enabled !== undefined ? { enabled: policy.enabled } : {}),
      ...(policy.config !== undefined ? { config: { ...policy.config } } : {}),
    })),
    ...(signature !== undefined
      ? {
        signature: {
          algorithm: signature.algorithm,
          ...(signature.keyId !== undefined ? { keyId: signature.keyId } : {}),
        },
      }
      : {}),
  };
}

/**
 * Canonical payload signed for approval policy manifests.
 *
 * The signature block is intentionally excluded. Policy array order is preserved
 * because evaluator order can be security-significant; object keys are sorted so
 * independently generated manifests produce the same HMAC bytes.
 */
export function formatApprovalPolicyManifestPayload(
  manifest: ApprovalPolicyManifest | Omit<ApprovalPolicyManifest, 'signature'>,
): string {
  return stableJson(manifestPayloadShape(manifest));
}

export function verifySignedApprovalPolicyManifest(
  manifest: ApprovalPolicyManifest,
  options: ApprovalPolicyManifestVerificationOptions = {},
): VerifiedApprovalPolicyManifest {
  assertManifestShape(manifest);

  const signature = manifest.signature;
  if (signature === undefined) {
    if (options.allowUnsigned === true) {
      return { manifestId: manifest.manifestId, signed: false };
    }
    throw new ApprovalConfigurationError(
      `Approval policy manifest ${manifest.manifestId} is unsigned. Refusing to load without allowUnsigned override.`,
    );
  }

  if (signature.algorithm !== 'hmac-sha256') {
    throw new ApprovalConfigurationError(
      `Unsupported approval policy manifest signature algorithm: ${String(signature.algorithm)}`,
    );
  }
  if (options.verifier === undefined) {
    throw new ApprovalConfigurationError(
      `Approval policy manifest ${manifest.manifestId} is signed but no verifier is configured.`,
    );
  }

  const payload = formatApprovalPolicyManifestPayload(manifest);
  if (!options.verifier.verify(payload, signature.value)) {
    throw new SignatureVerificationError(
      `Approval policy manifest ${manifest.manifestId} signature verification failed`,
    );
  }

  return {
    manifestId: manifest.manifestId,
    signed: true,
    ...(signature.keyId !== undefined ? { signatureKeyId: signature.keyId } : {}),
  };
}

export function createEvaluatorsFromApprovalPolicyManifest(
  manifest: ApprovalPolicyManifest,
  options: ApprovalPolicyManifestVerificationOptions = {},
): TriggerEvaluator[] {
  verifySignedApprovalPolicyManifest(manifest, options);
  return manifest.policies
    .filter((policy) => policy.enabled !== false)
    .map((policy) => createEvaluator(policy));
}

function createEvaluator(policy: ApprovalPolicyManifestPolicy): TriggerEvaluator {
  const triggerId = policy.triggerId as string;
  switch (triggerId) {
    case 'skill':
      assertNoUnsupportedConfig(policy);
      return new SkillTrigger();
    case 'budget':
      assertNoUnsupportedConfig(policy);
      return new BudgetTrigger();
    case 'ambiguity':
      assertNoUnsupportedConfig(policy);
      return new AmbiguityTrigger();
    case 'confidence': {
      assertKnownConfigKeys(policy, ['threshold']);
      const threshold = policy.config?.threshold;
      if (threshold !== undefined && (!Number.isFinite(threshold) || threshold < 0 || threshold > 1)) {
        throw new ApprovalConfigurationError(
          `Approval policy manifest confidence threshold must be a number between 0 and 1.`,
        );
      }
      return new ConfidenceTrigger(threshold);
    }
    default:
      throw new ApprovalConfigurationError(`Unsupported approval policy triggerId: ${triggerId}`);
  }
}

function assertKnownConfigKeys(
  policy: ApprovalPolicyManifestPolicy,
  allowedKeys: ReadonlyArray<string>,
): void {
  for (const key of Object.keys(policy.config ?? {})) {
    if (!allowedKeys.includes(key)) {
      throw new ApprovalConfigurationError(`Unsupported ${policy.triggerId} policy config key: ${key}`);
    }
  }
}

function assertNoUnsupportedConfig(policy: ApprovalPolicyManifestPolicy): void {
  assertKnownConfigKeys(policy, []);
}

function assertManifestShape(manifest: ApprovalPolicyManifest): void {
  if (manifest.schemaVersion !== 1) {
    throw new ApprovalConfigurationError('Approval policy manifest schemaVersion must be 1.');
  }
  if (manifest.manifestId.trim() === '') {
    throw new ApprovalConfigurationError('Approval policy manifest manifestId must be non-empty.');
  }
  if (Number.isNaN(Date.parse(manifest.issuedAt))) {
    throw new ApprovalConfigurationError(
      `Approval policy manifest ${manifest.manifestId} issuedAt must be an ISO timestamp.`,
    );
  }
  if (manifest.policies.length === 0) {
    throw new ApprovalConfigurationError(
      `Approval policy manifest ${manifest.manifestId} must contain at least one policy.`,
    );
  }
}
