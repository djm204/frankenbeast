import type { EpisodicTrace } from '../types/index.js';
import type { IEpisodicStore } from '../episodic/episodic-store-interface.js';
import type { IPiiScanner } from './pii-scanner-interface.js';
import { PiiGuard } from './pii-guard.js';

/**
 * Decorator: scans EpisodicTrace payloads for PII before delegating
 * record() to the inner store. Read-only methods pass through unscanned.
 */
export class PiiGuardedEpisodicStore implements IEpisodicStore {
  private readonly guard: PiiGuard;

  constructor(
    private readonly inner: IEpisodicStore,
    scanner: IPiiScanner,
  ) {
    this.guard = new PiiGuard(scanner);
  }

  async record(trace: EpisodicTrace): Promise<string> {
    await this.guard.check(trace);
    return this.inner.record(trace);
  }

  query(taskId: string, projectId?: string): EpisodicTrace[] {
    return this.inner.query(taskId, projectId);
  }

  queryFailed(projectId: string): EpisodicTrace[] {
    return this.inner.queryFailed(projectId);
  }

  markCompressed(ids: string[]): void {
    this.inner.markCompressed(ids);
  }

  count(projectId: string, taskId: string): number {
    return this.inner.count(projectId, taskId);
  }
}
