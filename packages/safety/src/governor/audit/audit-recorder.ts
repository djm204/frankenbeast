import type { ApprovalRequest, ApprovalResponse, ResponseCode } from '../core/types.js';
import type { GovernorMemoryPort, EpisodicTraceRecord } from './governor-memory-port.js';
import type { AuditRecorder } from '../gateway/approval-gateway.js';

export class GovernorAuditRecorder implements AuditRecorder {
  constructor(private readonly memoryPort: GovernorMemoryPort) {}

  async record(request: ApprovalRequest, response: ApprovalResponse): Promise<void> {
    const trace: EpisodicTraceRecord = {
      id: request.requestId,
      type: 'episodic',
      projectId: request.projectId,
      status: this.toStatus(response.decision),
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
      },
      tags: this.buildTags(response),
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

  private buildTags(response: ApprovalResponse): string[] {
    const tags: string[] = ['hitl'];

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
