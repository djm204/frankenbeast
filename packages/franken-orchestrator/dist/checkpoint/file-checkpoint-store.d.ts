import type { ICheckpointStore } from '../deps.js';
export declare class FileCheckpointStore implements ICheckpointStore {
    private readonly filePath;
    constructor(filePath: string);
    has(key: string): boolean;
    write(key: string): void;
    readAll(): Set<string>;
    clear(): void;
    recordCommit(taskId: string, stage: string, iteration: number, commitHash: string): void;
    lastCommit(taskId: string, stage: string): string | undefined;
}
//# sourceMappingURL=file-checkpoint-store.d.ts.map