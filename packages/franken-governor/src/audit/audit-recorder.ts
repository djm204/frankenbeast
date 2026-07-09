import type { ApprovalRequest, ApprovalResponse, ResponseCode } from '../core/types.js';
import type { GovernorMemoryPort, EpisodicTraceRecord } from './governor-memory-port.js';
import type { AuditRecorder, AuditRecordOptions } from '../gateway/approval-gateway.js';

export class GovernorAuditRecorder implements AuditRecorder {
  constructor(private readonly memoryPort: GovernorMemoryPort) {}

  async record(
    request: ApprovalRequest,
    response: ApprovalResponse,
    options: AuditRecordOptions = {},
  ): Promise<void> {
    const signatureVerificationFailed = options.securityFailure === 'signature-verification';
    const trace: EpisodicTraceRecord = {
      id: request.requestId,
      type: 'episodic',
      projectId: request.projectId,
      status: signatureVerificationFailed ? 'failure' : this.toStatus(response.decision),
      createdAt: Date.now(),
      taskId: request.taskId,
      toolName: 'hitl-gateway',
      input: {
        summary: request.summary,
        triggerId: request.trigger.triggerId,
        triggerReason: request.trigger.reason,
        triggerSeverity: request.trigger.severity,
      },
      output: {
        decision: response.decision,
        respondedBy: response.respondedBy,
        feedback: response.feedback,
        securityFailure: options.securityFailure,
      },
      tags: this.buildTags(response, options),
    };

    await this.memoryPort.recordDecision(trace);
  }

  private toStatus(decision: ResponseCode): 'success' | 'failure' {
    switch (decision) {
      case 'APPROVE':
      case 'DEBUG':
        return 'success';
      case 'REGEN':
      case 'ABORT':
        return 'failure';
    }
  }

  private buildTags(response: ApprovalResponse, options: AuditRecordOptions = {}): string[] {
    const tags: string[] = ['hitl'];

    if (options.securityFailure === 'signature-verification') {
      tags.push('hitl:signature-verification-failed', 'hitl:security-failure');
      return tags;
    }

    switch (response.decision) {
      case 'APPROVE':
        tags.push('hitl:approved', 'hitl:preferred-pattern');
        break;
      case 'REGEN':
        tags.push('hitl:rejected', 'hitl:rejection-reason');
        break;
      case 'ABORT':
        tags.push('hitl:aborted');
        break;
      case 'DEBUG':
        tags.push('hitl:debug');
        break;
    }

    return tags;
  }
}
