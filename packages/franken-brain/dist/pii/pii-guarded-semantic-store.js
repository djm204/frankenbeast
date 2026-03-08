import { PiiGuard } from './pii-guard.js';
/**
 * Decorator: scans SemanticChunk content for PII before delegating
 * upsert() to the inner store. Read-only methods pass through unscanned.
 */
export class PiiGuardedSemanticStore {
    inner;
    guard;
    constructor(inner, scanner) {
        this.inner = inner;
        this.guard = new PiiGuard(scanner);
    }
    async upsert(chunks) {
        for (const chunk of chunks) {
            await this.guard.check(chunk);
        }
        return this.inner.upsert(chunks);
    }
    async search(query, topK, filter) {
        return this.inner.search(query, topK, filter);
    }
    async delete(id) {
        return this.inner.delete(id);
    }
    async deleteCollection(projectId) {
        return this.inner.deleteCollection(projectId);
    }
}
//# sourceMappingURL=pii-guarded-semantic-store.js.map