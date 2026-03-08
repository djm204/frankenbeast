import type { EpisodicTrace } from '../types/index.js';
import type { IEpisodicStore } from '../episodic/episodic-store-interface.js';
import type { IPiiScanner } from './pii-scanner-interface.js';
/**
 * Decorator: scans EpisodicTrace payloads for PII before delegating
 * record() to the inner store. Read-only methods pass through unscanned.
 */
export declare class PiiGuardedEpisodicStore implements IEpisodicStore {
    private readonly inner;
    private readonly guard;
    constructor(inner: IEpisodicStore, scanner: IPiiScanner);
    record(trace: EpisodicTrace): Promise<string>;
    query(taskId: string, projectId?: string): EpisodicTrace[];
    queryFailed(projectId: string): EpisodicTrace[];
    markCompressed(ids: string[]): void;
    count(projectId: string, taskId: string): number;
}
//# sourceMappingURL=pii-guarded-episodic-store.d.ts.map