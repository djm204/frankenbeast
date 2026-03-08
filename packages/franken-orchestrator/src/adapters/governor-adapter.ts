import { randomUUID } from 'node:crypto';
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

export type ApprovalOutcomePort =
  | { decision: 'APPROVE'; token?: unknown }
  | { decision: 'REGEN'; feedback: string }
  | { decision: 'ABORT'; reason?: string }
  | { decision: 'DEBUG' };

export interface GovernorPortAdapterDeps {
  gateway: ApprovalGatewayPort;
  projectId: string;
  defaultDecision?: GovernorDecision | undefined;
  idFactory?: () => string;
  clock?: () => Date;
}

export class GovernorPortAdapter implements IGovernorModule {
  private readonly gateway: ApprovalGatewayPort;
  private readonly projectId: string;
  private readonly defaultDecision: GovernorDecision | undefined;
  private readonly idFactory: () => string;
  private readonly clock: () => Date;

  constructor(deps: GovernorPortAdapterDeps) {
    this.gateway = deps.gateway;
    this.projectId = deps.projectId;
    this.defaultDecision = deps.defaultDecision;
    this.idFactory = deps.idFactory ?? randomUUID;
    this.clock = deps.clock ?? (() => new Date());
  }

  async requestApproval(request: ApprovalPayload): Promise<ApprovalOutcome> {
    if (!request.requiresHitl) {
      return { decision: 'approved' };
    }

    if (this.defaultDecision) {
      return { decision: this.defaultDecision, reason: 'defaultDecision' };
    }

    const approvalRequest = this.buildRequest(request);

    try {
      const outcome = await this.gateway.requestApproval(approvalRequest);
      return mapOutcome(outcome);
    } catch (error) {
      throw new Error(`GovernorPortAdapter failed: ${errorMessage(error)}`, { cause: error });
    }
  }

  private buildRequest(payload: ApprovalPayload): ApprovalRequestPort {
    const trigger: ApprovalRequestPort['trigger'] = {
      triggered: payload.requiresHitl,
      triggerId: 'hitl_required',
    };

    if (payload.requiresHitl) {
      trigger.reason = 'Task requires HITL approval';
      trigger.severity = 'high';
    }

    const request: ApprovalRequestPort = {
      requestId: this.idFactory(),
      taskId: payload.taskId,
      projectId: this.projectId,
      trigger,
      summary: payload.summary,
      timestamp: this.clock(),
    };

    if (payload.skillId) {
      request.skillId = payload.skillId;
    }

    return request;
  }
}

function mapOutcome(outcome: ApprovalOutcomePort): ApprovalOutcome {
  switch (outcome.decision) {
    case 'APPROVE':
      return { decision: 'approved' };
    case 'ABORT':
      return { decision: 'abort', reason: outcome.reason };
    case 'REGEN':
      return { decision: 'rejected', reason: outcome.feedback };
    case 'DEBUG':
      return { decision: 'rejected', reason: 'Debug requested' };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
