import type { ApprovalRequest, ApprovalResponse } from '../core/types.js';
import type { GovernorMemoryPort } from './governor-memory-port.js';
import type { AuditRecorder } from '../gateway/approval-gateway.js';
export declare class GovernorAuditRecorder implements AuditRecorder {
    private readonly memoryPort;
    constructor(memoryPort: GovernorMemoryPort);
    record(request: ApprovalRequest, response: ApprovalResponse): Promise<void>;
    private toStatus;
    private buildTags;
}
//# sourceMappingURL=audit-recorder.d.ts.map