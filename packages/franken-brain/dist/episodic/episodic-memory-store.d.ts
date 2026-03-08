import type { Database as BetterSqlite3Database } from 'better-sqlite3';
import type { EpisodicTrace } from '../types/index.js';
import type { IEpisodicStore } from './episodic-store-interface.js';
export declare class EpisodicMemoryStore implements IEpisodicStore {
    private readonly db;
    constructor(db: BetterSqlite3Database);
    record(trace: EpisodicTrace): string;
    query(taskId: string, projectId?: string): EpisodicTrace[];
    queryFailed(projectId: string): EpisodicTrace[];
    markCompressed(ids: string[]): void;
    count(projectId: string, taskId: string): number;
    private runMigrations;
}
//# sourceMappingURL=episodic-memory-store.d.ts.map