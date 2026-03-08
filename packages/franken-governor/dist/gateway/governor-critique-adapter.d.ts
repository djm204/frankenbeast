import type { ApprovalChannel } from './approval-channel.js';
import { type AuditRecorder } from './approval-gateway.js';
import type { TriggerEvaluator } from '../triggers/trigger-evaluator.js';
import type { RationaleBlock, VerificationResult } from '@franken/types';
export interface GovernorCritiqueAdapterDeps {
    readonly channel: ApprovalChannel;
    readonly auditRecorder: AuditRecorder;
    readonly evaluators: ReadonlyArray<TriggerEvaluator>;
    readonly projectId: string;
}
export declare class GovernorCritiqueAdapter {
    private readonly gateway;
    private readonly evaluators;
    private readonly projectId;
    constructor(deps: GovernorCritiqueAdapterDeps);
    verifyRationale(rationale: RationaleBlock): Promise<VerificationResult>;
    private evaluateTriggers;
}
//# sourceMappingURL=governor-critique-adapter.d.ts.map