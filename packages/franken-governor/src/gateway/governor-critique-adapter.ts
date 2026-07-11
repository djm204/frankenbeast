import type { ApprovalRequest, TriggerResult } from '../core/types.js';
import { defaultConfig, type GovernorConfig } from '../core/config.js';
import type { ApprovalChannel } from './approval-channel.js';
import { ApprovalGateway, type AuditRecorder } from './approval-gateway.js';
import type { SignatureVerifier } from '../security/signature-verifier.js';
import type { TriggerEvaluator } from '../triggers/trigger-evaluator.js';
import { BudgetTrigger, type BudgetTriggerContext } from '../triggers/budget-trigger.js';
import { evaluateTrigger } from '../triggers/evaluate-trigger.js';
import { SkillTrigger, type SkillTriggerContext } from '../triggers/skill-trigger.js';
import type { RationaleBlock, VerificationResult } from '@franken/types';
import { deterministicUuid, now as deterministicNow } from '@franken/types';

/** Governance flags for a skill, looked up by the adapter per rationale. */
export interface SkillGovernanceMetadata {
  readonly requiresHitl: boolean;
  readonly isDestructive: boolean;
}

/**
 * Source of skill governance metadata (e.g. a skill registry). Returning
 * `undefined` means the skill is unknown and the SkillTrigger is skipped.
 */
export interface SkillMetadataSource {
  getSkillMetadata(skillId: string): SkillGovernanceMetadata | undefined;
}

/** Source of the current budget circuit-breaker state (e.g. MOD-05 observer). */
export interface BudgetStateSource {
  getBudgetState(): BudgetTriggerContext;
}

export interface GovernorCritiqueAdapterDeps {
  readonly channel: ApprovalChannel;
  readonly auditRecorder: AuditRecorder;
  readonly evaluators: ReadonlyArray<TriggerEvaluator>;
  readonly projectId: string;
  readonly config?: GovernorConfig;
  readonly signatureVerifier?: SignatureVerifier;
  /**
   * Supplies HITL/destructive flags for `rationale.selectedTool`. Without it a
   * registered SkillTrigger is skipped (its context cannot be constructed).
   */
  readonly skillMetadata?: SkillMetadataSource;
  /**
   * Supplies the budget circuit-breaker state. Without it a registered
   * BudgetTrigger is skipped (its context cannot be constructed).
   */
  readonly budgetState?: BudgetStateSource;
}

/** Sentinel result for an evaluator whose context cannot be constructed. */
type TriggerContext = { readonly skip: true } | { readonly skip: false; readonly context: unknown };

const SKIP: TriggerContext = { skip: true };

export class GovernorCritiqueAdapter {
  private readonly gateway: ApprovalGateway;
  private readonly evaluators: ReadonlyArray<TriggerEvaluator>;
  private readonly projectId: string;
  private readonly skillMetadata: SkillMetadataSource | undefined;
  private readonly budgetState: BudgetStateSource | undefined;

  constructor(deps: GovernorCritiqueAdapterDeps) {
    this.gateway = new ApprovalGateway({
      channel: deps.channel,
      auditRecorder: deps.auditRecorder,
      config: deps.config ?? defaultConfig(),
      ...(deps.signatureVerifier ? { signatureVerifier: deps.signatureVerifier } : {}),
    });
    this.evaluators = deps.evaluators;
    this.projectId = deps.projectId;
    this.skillMetadata = deps.skillMetadata;
    this.budgetState = deps.budgetState;
  }

  async verifyRationale(rationale: RationaleBlock): Promise<VerificationResult> {
    const triggerResult = this.evaluateTriggers(rationale);

    if (!triggerResult.triggered) {
      return { verdict: 'approved' };
    }

    const base = {
      requestId: deterministicUuid('packages/franken-governor/src/gateway/governor-critique-adapter.ts'),
      taskId: rationale.taskId as string,
      projectId: this.projectId,
      trigger: triggerResult,
      summary: `${rationale.reasoning} → ${rationale.expectedOutcome}`,
      timestamp: new Date(deterministicNow()),
    };

    const request: ApprovalRequest = rationale.selectedTool !== undefined
      ? { ...base, skillId: rationale.selectedTool }
      : base;

    const outcome = await this.gateway.requestApproval(request);

    switch (outcome.decision) {
      case 'APPROVE':
        return { verdict: 'approved' };
      case 'REGEN':
        return { verdict: 'rejected', reason: outcome.feedback };
      case 'ABORT':
        return { verdict: 'rejected', reason: outcome.reason ?? 'Aborted by human' };
      case 'DEBUG':
        return { verdict: 'approved' };
    }
  }

  private evaluateTriggers(rationale: RationaleBlock): TriggerResult {
    for (const evaluator of this.evaluators) {
      const triggerContext = this.buildTriggerContext(evaluator, rationale);
      // Explicit skip: the evaluator's typed context cannot be constructed
      // from the rationale + injected sources, so it must not be fed a
      // RationaleBlock it was never typed for (see issue #490).
      if (triggerContext.skip) continue;
      const result = evaluateTrigger(evaluator, triggerContext.context);
      if (result.triggered) return result;
    }
    return { triggered: false, triggerId: 'none' };
  }

  /**
   * Builds the evaluator's typed context. Built-in SkillTrigger/BudgetTrigger
   * instances get real contexts derived from the rationale's selected tool and
   * the injected sources; any other evaluator receives the RationaleBlock and
   * must be typed to accept it.
   */
  private buildTriggerContext(evaluator: TriggerEvaluator, rationale: RationaleBlock): TriggerContext {
    if (evaluator instanceof SkillTrigger) {
      const skillId = rationale.selectedTool;
      if (skillId === undefined) return SKIP;
      const metadata = this.skillMetadata?.getSkillMetadata(skillId);
      if (metadata === undefined) return SKIP;
      const context: SkillTriggerContext = {
        skillId,
        requiresHitl: metadata.requiresHitl,
        isDestructive: metadata.isDestructive,
      };
      return { skip: false, context };
    }

    if (evaluator instanceof BudgetTrigger) {
      if (this.budgetState === undefined) return SKIP;
      return { skip: false, context: this.budgetState.getBudgetState() };
    }

    return { skip: false, context: rationale };
  }
}
