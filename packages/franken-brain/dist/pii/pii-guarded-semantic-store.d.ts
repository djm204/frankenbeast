import type { SemanticChunk } from '../types/index.js';
import type { ISemanticStore, MetadataFilter } from '../semantic/semantic-store-interface.js';
import type { IPiiScanner } from './pii-scanner-interface.js';
/**
 * Decorator: scans SemanticChunk content for PII before delegating
 * upsert() to the inner store. Read-only methods pass through unscanned.
 */
export declare class PiiGuardedSemanticStore implements ISemanticStore {
    private readonly inner;
    private readonly guard;
    constructor(inner: ISemanticStore, scanner: IPiiScanner);
    upsert(chunks: SemanticChunk[]): Promise<void>;
    search(query: string, topK: number, filter?: MetadataFilter): Promise<SemanticChunk[]>;
    delete(id: string): Promise<void>;
    deleteCollection(projectId: string): Promise<void>;
}
//# sourceMappingURL=pii-guarded-semantic-store.d.ts.map