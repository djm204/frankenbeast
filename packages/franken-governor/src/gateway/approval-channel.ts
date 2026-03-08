import type { ApprovalRequest, ApprovalResponse } from '../core/types.js';

export interface ApprovalChannel {
  readonly channelId: string;
  requestApproval(request: ApprovalRequest): Promise<ApprovalResponse>;
}
