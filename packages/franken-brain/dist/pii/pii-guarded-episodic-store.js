import { PiiGuard } from './pii-guard.js';
/**
 * Decorator: scans EpisodicTrace payloads for PII before delegating
 * record() to the inner store. Read-only methods pass through unscanned.
 */
export class PiiGuardedEpisodicStore {
    inner;
    guard;
    constructor(inner, scanner) {
        this.inner = inner;
        this.guard = new PiiGuard(scanner);
    }
    async record(trace) {
        await this.guard.check(trace);
        return this.inner.record(trace);
    }
    query(taskId, projectId) {
        return this.inner.query(taskId, projectId);
    }
    queryFailed(projectId) {
        return this.inner.queryFailed(projectId);
    }
    markCompressed(ids) {
        this.inner.markCompressed(ids);
    }
    count(projectId, taskId) {
        return this.inner.count(projectId, taskId);
    }
}
//# sourceMappingURL=pii-guarded-episodic-store.js.map