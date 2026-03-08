export class MemoryPortAdapter {
    traces = [];
    context;
    constructor(config = {}) {
        this.context = config.context ?? { adrs: [], knownErrors: [], rules: [] };
    }
    async frontload(_projectId) {
        return;
    }
    async getContext(_projectId) {
        return this.context;
    }
    async recordTrace(trace) {
        this.traces.push(trace);
    }
}
//# sourceMappingURL=memory-adapter.js.map