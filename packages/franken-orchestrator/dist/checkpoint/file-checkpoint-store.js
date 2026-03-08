import { appendFileSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
export class FileCheckpointStore {
    filePath;
    constructor(filePath) {
        this.filePath = filePath;
    }
    has(key) {
        return this.readAll().has(key);
    }
    write(key) {
        appendFileSync(this.filePath, key + '\n');
    }
    readAll() {
        if (!existsSync(this.filePath)) {
            return new Set();
        }
        const content = readFileSync(this.filePath, 'utf-8');
        const lines = content.split('\n').filter((line) => line.length > 0);
        return new Set(lines);
    }
    clear() {
        if (existsSync(this.filePath)) {
            writeFileSync(this.filePath, '');
        }
    }
    recordCommit(taskId, stage, iteration, commitHash) {
        this.write(`${taskId}:${stage}:iter_${iteration}:commit_${commitHash}`);
    }
    lastCommit(taskId, stage) {
        const prefix = `${taskId}:${stage}:iter_`;
        const all = this.readAll();
        let last;
        for (const entry of all) {
            if (entry.startsWith(prefix)) {
                const commitMatch = entry.match(/:commit_(.+)$/);
                if (commitMatch?.[1]) {
                    last = commitMatch[1];
                }
            }
        }
        return last;
    }
}
//# sourceMappingURL=file-checkpoint-store.js.map