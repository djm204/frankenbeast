import type { ApprovalResult, HITLGate } from './types.js';
export declare class StubHITLGate implements HITLGate {
    private readonly result;
    constructor(result?: ApprovalResult);
    requestApproval(_markdown: string): Promise<ApprovalResult>;
}
//# sourceMappingURL=stub-hitl-gate.d.ts.map