export type ResponseCode = 'APPROVE' | 'REGEN' | 'ABORT' | 'DEBUG';

export type TriggerSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface TriggerResult {
  readonly triggered: boolean;
  readonly triggerId: string;
  readonly reason?: string;
  readonly severity?: TriggerSeverity;
}

export interface ApprovalRequest {
  readonly requestId: string;
  readonly taskId: string;
  readonly projectId: string;
  readonly trigger: TriggerResult;
  readonly summary: string;
  readonly planDiff?: string;
  readonly skillId?: string;
  readonly timestamp: Date;
  readonly metadata?: Record<string, unknown>;
}

export interface ApprovalResponse {
  readonly requestId: string;
  readonly decision: ResponseCode;
  readonly feedback?: string;
  readonly respondedBy: string;
  readonly respondedAt: Date;
  readonly signature?: string;
}

export type ApprovalOutcome =
  | { readonly decision: 'APPROVE'; readonly token?: SessionToken }
  | { readonly decision: 'REGEN'; readonly feedback: string }
  | { readonly decision: 'ABORT'; readonly reason?: string }
  | { readonly decision: 'DEBUG' };

export interface SessionToken {
  readonly tokenId: string;
  readonly approvalId: string;
  readonly scope: string;
  readonly grantedBy: string;
  readonly grantedAt: Date;
  readonly expiresAt: Date;
}
