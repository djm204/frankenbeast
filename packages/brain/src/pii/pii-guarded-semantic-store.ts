import type { SemanticChunk } from '../types/index.js';
import type { ISemanticStore, MetadataFilter } from '../semantic/semantic-store-interface.js';
import type { IPiiScanner } from './pii-scanner-interface.js';
import { PiiGuard } from './pii-guard.js';

/**
 * Decorator: scans SemanticChunk content for PII before delegating
 * upsert() to the inner store. Read-only methods pass through unscanned.
 */
export class PiiGuardedSemanticStore implements ISemanticStore {
  private readonly guard: PiiGuard;

  constructor(
    private readonly inner: ISemanticStore,
    scanner: IPiiScanner,
  ) {
    this.guard = new PiiGuard(scanner);
  }

  async upsert(chunks: SemanticChunk[]): Promise<void> {
    for (const chunk of chunks) {
      await this.guard.check(chunk);
    }
    return this.inner.upsert(chunks);
  }

  async search(query: string, topK: number, filter?: MetadataFilter): Promise<SemanticChunk[]> {
    return this.inner.search(query, topK, filter);
  }

  async delete(id: string): Promise<void> {
    return this.inner.delete(id);
  }

  async deleteCollection(projectId: string): Promise<void> {
    return this.inner.deleteCollection(projectId);
  }
}
