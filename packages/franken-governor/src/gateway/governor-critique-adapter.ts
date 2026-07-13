import type { ApprovalRequest, SessionToken, TriggerResult } from '../core/types.js';
import { defaultConfig, type GovernorConfig } from '../core/config.js';
import type { ApprovalChannel } from './approval-channel.js';
import { ApprovalGateway, type AuditRecorder } from './approval-gateway.js';
import type { SignatureVerifier } from '../security/signature-verifier.js';
import type { SessionTokenStore } from '../security/session-token-store.js';
import { formatApprovalSessionTokenScope } from '../security/session-token-scope.js';
import type { TriggerEvaluator } from '../triggers/trigger-evaluator.js';
import { BudgetTrigger, type BudgetTriggerContext } from '../triggers/budget-trigger.js';
import { evaluateTrigger } from '../triggers/evaluate-trigger.js';
import { SkillTrigger, type SkillTriggerContext } from '../triggers/skill-trigger.js';
import { ConfidenceTrigger } from '../triggers/confidence-trigger.js';
import { AmbiguityTrigger } from '../triggers/ambiguity-trigger.js';
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
  /**
   * Optional operator-session token store. When supplied, a triggered risky
   * action may proceed without another prompt only if the rationale presents a
   * non-expired token scoped to the selected tool or task.
   */
  readonly sessionTokenStore?: SessionTokenStore;
}

/** Sentinel result for an evaluator whose context cannot be constructed. */
type TriggerContext = { readonly skip: true } | { readonly skip: false; readonly context: unknown };

const SKIP: TriggerContext = { skip: true };

export class GovernorCritiqueAdapter {
  private readonly gateway: ApprovalGateway;
  private readonly auditRecorder: AuditRecorder;
  private readonly evaluators: ReadonlyArray<TriggerEvaluator>;
  private readonly projectId: string;
  private readonly skillMetadata: SkillMetadataSource | undefined;
  private readonly budgetState: BudgetStateSource | undefined;
  private readonly sessionTokenStore: SessionTokenStore | undefined;

  constructor(deps: GovernorCritiqueAdapterDeps) {
    this.gateway = new ApprovalGateway({
      channel: deps.channel,
      auditRecorder: deps.auditRecorder,
      config: deps.config ?? defaultConfig(),
      ...(deps.signatureVerifier ? { signatureVerifier: deps.signatureVerifier } : {}),
      ...(deps.sessionTokenStore ? { sessionTokenStore: deps.sessionTokenStore } : {}),
    });
    this.auditRecorder = deps.auditRecorder;
    this.evaluators = deps.evaluators;
    this.projectId = deps.projectId;
    this.skillMetadata = deps.skillMetadata;
    this.budgetState = deps.budgetState;
    this.sessionTokenStore = deps.sessionTokenStore;
  }

  async verifyRationale(rationale: RationaleBlock): Promise<VerificationResult> {
    const triggerResults = this.evaluateTriggeredResults(rationale);

    if (triggerResults.length === 0) {
      return { verdict: 'approved' };
    }

    const triggerResult = this.formatTriggerForPrompt(triggerResults);

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

    const operatorSessionToken = this.canReuseOperatorSessionToken(triggerResults)
      ? this.getValidOperatorSessionToken(request, rationale)
      : undefined;
    if (operatorSessionToken) {
      await this.recordOperatorSessionReuse(request, operatorSessionToken);
      return { verdict: 'approved' };
    }

    const outcome = await this.gateway.requestApproval(request);

    switch (outcome.decision) {
      case 'APPROVE':
        return outcome.token !== undefined
          ? { verdict: 'approved', approvalSessionTokenId: outcome.token.tokenId }
          : { verdict: 'approved' };
      case 'REGEN':
        return { verdict: 'rejected', reason: outcome.feedback };
      case 'ABORT':
        return { verdict: 'rejected', reason: outcome.reason ?? 'Aborted by human' };
      case 'DEBUG':
        return { verdict: 'approved' };
    }
  }

  private evaluateTriggeredResults(rationale: RationaleBlock): TriggerResult[] {
    const triggeredResults: TriggerResult[] = [];

    for (const evaluator of this.evaluators) {
      const triggerContext = this.buildTriggerContext(evaluator, rationale);
      // Explicit skip: the evaluator's typed context cannot be constructed
      // from the rationale + injected sources, so it must not be fed a
      // RationaleBlock it was never typed for (see issue #490).
      if (triggerContext.skip) continue;
      const result = evaluateTrigger(evaluator, triggerContext.context);
      if (!result.triggered) continue;

      triggeredResults.push(result);
      if (result.severity === 'critical' && result.reason?.startsWith(`Trigger '${result.triggerId}' evaluation failed:`)) {
        return triggeredResults;
      }
    }
    return triggeredResults;
  }

  private selectTriggerForPrompt(triggerResults: ReadonlyArray<TriggerResult>): TriggerResult {
    const evaluationFailure = triggerResults.find((result) => this.isTriggerEvaluationFailure(result));
    if (evaluationFailure !== undefined) return evaluationFailure;

    return triggerResults.find((result) => result.triggerId === 'skill')
      ?? triggerResults.find((result) => result.triggerId !== 'skill')
      ?? triggerResults[0]!;
  }

  private formatTriggerForPrompt(triggerResults: ReadonlyArray<TriggerResult>): TriggerResult {
    const selected = this.selectTriggerForPrompt(triggerResults);
    const additionalResults = triggerResults.filter((result) => result !== selected);
    if (additionalResults.length === 0) return selected;

    const additionalReasons = additionalResults
      .map((result) => `${result.triggerId}: ${result.reason ?? 'triggered'}`)
      .join('; ');

    return {
      ...selected,
      reason: `${selected.reason ?? 'Triggered'}; Additional triggered policies: ${additionalReasons}`,
    };
  }

  private canReuseOperatorSessionToken(triggerResults: ReadonlyArray<TriggerResult>): boolean {
    return triggerResults.length === 1 && !this.isTriggerEvaluationFailure(triggerResults[0]!);
  }

  private isTriggerEvaluationFailure(triggerResult: TriggerResult): boolean {
    return triggerResult.severity === 'critical'
      && triggerResult.reason?.startsWith(`Trigger '${triggerResult.triggerId}' evaluation failed:`) === true;
  }


  private getValidOperatorSessionToken(request: ApprovalRequest, rationale: RationaleBlock): SessionToken | undefined {
    if (!this.sessionTokenStore) {
      return undefined;
    }

    const scope = formatApprovalSessionTokenScope(request);
    for (const tokenId of this.getApprovalSessionTokenCandidates(rationale)) {
      try {
        const token = this.sessionTokenStore.get(tokenId);
        if (token?.scope === scope) return token;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  private getApprovalSessionTokenCandidates(rationale: RationaleBlock): string[] {
    return [
      ...(rationale.approvalSessionTokenIds ?? []),
      ...(rationale.approvalSessionTokenId !== undefined ? [rationale.approvalSessionTokenId] : []),
    ].filter((tokenId, index, tokenIds) => tokenIds.indexOf(tokenId) === index);
  }

  private async recordOperatorSessionReuse(request: ApprovalRequest, token: SessionToken): Promise<void> {
    await this.auditRecorder.record(request, {
      requestId: request.requestId,
      decision: 'APPROVE',
      respondedBy: 'operator-session-token',
      respondedAt: new Date(deterministicNow()),
      feedback: `Approved by scoped operator session token from approval ${token.approvalId} granted by ${token.grantedBy}`,
    });
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

    if (evaluator instanceof ConfidenceTrigger || evaluator instanceof AmbiguityTrigger) {
      return SKIP;
    }

    const rationaleWithoutBearerToken = { ...rationale };
    delete rationaleWithoutBearerToken.approvalSessionTokenId;
    delete rationaleWithoutBearerToken.approvalSessionTokenIds;
    return { skip: false, context: rationaleWithoutBearerToken };
  }
}
