import {
  GovernorCritiqueAdapter,
  type BudgetStateSource,
  type SkillMetadataSource,
} from './governor-critique-adapter.js';
import { GovernorAuditRecorder } from '../audit/audit-recorder.js';
import { CliChannel, type ReadlineAdapter } from '../channels/cli-channel.js';
import type { GovernorMemoryPort } from '../audit/governor-memory-port.js';
import type { TriggerEvaluator } from '../triggers/trigger-evaluator.js';
import { normalizeGovernorConfig, type GovernorConfig } from '../core/config.js';
import type { SessionTokenStore } from '../security/session-token-store.js';
import type { SignatureVerifier } from '../security/signature-verifier.js';
import {
  createEvaluatorsFromApprovalPolicyManifest,
  type ApprovalPolicyManifest,
} from '../security/approval-policy-manifest.js';
import { ApprovalConfigurationError } from '../errors/index.js';

export interface CreateGovernorOptions {
  readonly readline: ReadlineAdapter;
  readonly memoryPort: GovernorMemoryPort;
  readonly evaluators?: ReadonlyArray<TriggerEvaluator>;
  readonly projectId?: string;
  readonly operatorName?: string;
  readonly config?: Partial<GovernorConfig>;
  /** Skill governance flags for SkillTrigger contexts (e.g. a skill registry). */
  readonly skillMetadata?: SkillMetadataSource;
  /** Budget circuit-breaker state for BudgetTrigger contexts (e.g. MOD-05). */
  readonly budgetState?: BudgetStateSource;
  /** Shared operator-session token store for approval issuance and validation. */
  readonly sessionTokenStore?: SessionTokenStore;
  /**
   * Signed approval policy manifest. When present it becomes the evaluator
   * source after signature verification; unsigned manifests are rejected unless
   * allowUnsignedPolicyManifest is explicitly true.
   */
  readonly approvalPolicyManifest?: ApprovalPolicyManifest;
  readonly policyManifestSignatureVerifier?: SignatureVerifier;
  readonly allowUnsignedPolicyManifest?: boolean;
}

export function createGovernor(options: CreateGovernorOptions): GovernorCritiqueAdapter {
  let config: GovernorConfig;
  try {
    config = normalizeGovernorConfig(options.config);
  } catch (error) {
    throw new ApprovalConfigurationError((error as Error).message);
  }

  const channel = new CliChannel({
    readline: options.readline,
    operatorName: options.operatorName ?? config.operatorName,
  });

  const auditRecorder = new GovernorAuditRecorder(options.memoryPort);
  const policyManifestOptions = {
    ...(options.policyManifestSignatureVerifier ? { verifier: options.policyManifestSignatureVerifier } : {}),
    ...(options.allowUnsignedPolicyManifest !== undefined ? { allowUnsigned: options.allowUnsignedPolicyManifest } : {}),
  };
  const evaluators = options.approvalPolicyManifest !== undefined
    ? createEvaluatorsFromApprovalPolicyManifest(options.approvalPolicyManifest, policyManifestOptions)
    : (options.evaluators ?? []);

  return new GovernorCritiqueAdapter({
    channel,
    auditRecorder,
    evaluators,
    projectId: options.projectId ?? 'default',
    config,
    ...(options.skillMetadata ? { skillMetadata: options.skillMetadata } : {}),
    ...(options.budgetState ? { budgetState: options.budgetState } : {}),
    ...(options.sessionTokenStore ? { sessionTokenStore: options.sessionTokenStore } : {}),
  });
}
