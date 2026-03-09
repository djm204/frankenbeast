import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ChunkSession } from './chunk-session.js';

export class FileChunkSessionStore {
  constructor(private readonly rootDir: string) {}

  save(session: ChunkSession): string {
    const filePath = this.filePathFor(session.planName, session.chunkId);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(session, null, 2));
    return filePath;
  }

  load(planName: string, chunkId: string): ChunkSession | undefined {
    const filePath = this.filePathFor(planName, chunkId);
    if (!existsSync(filePath)) {
      return undefined;
    }
    return JSON.parse(readFileSync(filePath, 'utf-8')) as ChunkSession;
  }

  delete(planName: string, chunkId: string): void {
    const filePath = this.filePathFor(planName, chunkId);
    if (existsSync(filePath)) {
      rmSync(filePath, { force: true });
    }
  }

  list(planName?: string): ChunkSession[] {
    const plans = planName ? [planName] : this.listPlanNames();
    const sessions: ChunkSession[] = [];

    for (const plan of plans) {
      const planDir = join(this.rootDir, plan);
      if (!existsSync(planDir)) continue;

      for (const file of readdirSync(planDir)) {
        if (!file.endsWith('.json')) continue;
        const loaded = this.load(plan, file.replace(/\.json$/u, ''));
        if (loaded) {
          sessions.push(loaded);
        }
      }
    }

    return sessions;
  }

  private filePathFor(planName: string, chunkId: string): string {
    return join(this.rootDir, planName, `${chunkId}.json`);
  }

  private listPlanNames(): string[] {
    if (!existsSync(this.rootDir)) {
      return [];
    }

    return readdirSync(this.rootDir).filter((entry) => statSync(join(this.rootDir, entry)).isDirectory());
  }
}
