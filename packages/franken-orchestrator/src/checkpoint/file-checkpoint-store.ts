import { appendFileSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ICheckpointStore } from '../deps.js';

export class FileCheckpointStore implements ICheckpointStore {
  constructor(private readonly filePath: string) {}

  has(key: string): boolean {
    return this.readAll().has(key);
  }

  write(key: string): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    appendFileSync(this.filePath, key + '\n');
  }

  readAll(): Set<string> {
    if (!existsSync(this.filePath)) {
      return new Set();
    }
    const content = readFileSync(this.filePath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.length > 0);
    return new Set(lines);
  }

  clear(): void {
    if (existsSync(this.filePath)) {
      writeFileSync(this.filePath, '');
    }
  }

  recordCommit(taskId: string, stage: string, iteration: number, commitHash: string): void {
    this.write(`${taskId}:${stage}:iter_${iteration}:commit_${commitHash}`);
  }

  lastCommit(taskId: string, stage: string): string | undefined {
    const prefix = `${taskId}:${stage}:iter_`;
    const all = this.readAll();
    let last: string | undefined;
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
