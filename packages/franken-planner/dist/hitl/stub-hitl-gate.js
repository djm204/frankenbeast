// stub — always returns approved (configurable via constructor)
export class StubHITLGate {
    result;
    constructor(result = { decision: 'approved' }) {
        this.result = result;
    }
    async requestApproval(_markdown) {
        return this.result;
    }
}
//# sourceMappingURL=stub-hitl-gate.js.map