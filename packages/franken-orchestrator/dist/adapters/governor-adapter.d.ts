import type { IGovernorModule, ApprovalPayload, ApprovalOutcome } from '../deps.js';
export type GovernorDecision = ApprovalOutcome['decision'];
export interface ApprovalGatewayPort {
    requestApproval(request: ApprovalRequestPort): Promise<ApprovalOutcomePort>;
}
export interface ApprovalRequestPort {
    requestId: string;
    taskId: string;
    projectId: string;
    trigger: {
        triggered: boolean;
        triggerId: string;
        reason?: string;
        severity?: 'low' | 'medium' | 'high' | 'critical';
    };
    summary: string;
    planDiff?: string;
    skillId?: string;
    timestamp: Date;
    metadata?: Record<string, unknown>;
}
export type ApprovalOutcomePort = {
    decision: 'APPROVE';
    token?: unknown;
} | {
    decision: 'REGEN';
    feedback: string;
} | {
    decision: 'ABORT';
    reason?: string;
} | {
    decision: 'DEBUG';
};
export interface GovernorPortAdapterDeps {
    gateway: ApprovalGatewayPort;
    projectId: string;
    defaultDecision?: GovernorDecision | undefined;
    idFactory?: () => string;
    clock?: () => Date;
}
export declare class GovernorPortAdapter implements IGovernorModule {
    private readonly gateway;
    private readonly projectId;
    private readonly defaultDecision;
    private readonly idFactory;
    private readonly clock;
    constructor(deps: GovernorPortAdapterDeps);
    requestApproval(request: ApprovalPayload): Promise<ApprovalOutcome>;
    private buildRequest;
}
//# sourceMappingURL=governor-adapter.d.ts.map