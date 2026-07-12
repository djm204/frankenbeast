import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ChunkSession } from './chunk-session.js';
import { chunkSessionStorageKey } from './chunk-session.js';
import { atomicWriteFileSync, readJsonFileOrQuarantine } from './atomic-file.js';

const QUARANTINE_SUFFIX = /\.corrupt\.\d+\.[0-9a-f-]+$/;

/**
 * Derives a session's storage key from a filename on disk, without parsing
 * JSON — recognizes both live `<key>.json` files and quarantined
 * `<key>.json.corrupt.<timestamp>.<uuid>` files (see readJsonFileOrQuarantine).
 * Returns undefined for anything else (directories, unrelated files).
 */
function sessionKeyFromFileName(file: string): string | undefined {
  const dequarantined = file.replace(QUARANTINE_SUFFIX, '');
  if (!dequarantined.endsWith('.json')) {
    return undefined;
  }
  return dequarantined.slice(0, -'.json'.length);
}

function isSessionFileForKey(file: string, key: string): boolean {
  return file === `${key}.json` || file.startsWith(`${key}.json.corrupt.`);
}

export class FileChunkSessionStore {
  constructor(private readonly rootDir: string) {}

  save(session: ChunkSession): string {
    const filePath = this.filePathFor(session.planName, session.chunkId, session.taskId);
    mkdirSync(dirname(filePath), { recursive: true });
    atomicWriteFileSync(filePath, JSON.stringify(session, null, 2));
    return filePath;
  }

  /**
   * Loads a session, degrading gracefully instead of throwing when a file is
   * corrupt (e.g. from a crash mid-write before atomic writes were adopted,
   * or external tampering). Corrupt files are quarantined by
   * readJsonFileOrQuarantine so a subsequent read never trips over them again.
   */
  load(planName: string, chunkId: string, taskId?: string): ChunkSession | undefined {
    const exactPath = this.filePathFor(planName, chunkId, taskId);
    if (existsSync(exactPath)) {
      const session = readJsonFileOrQuarantine<ChunkSession>(exactPath);
      if (session) {
        return session;
      }
      // Corrupt and quarantined — fall through and treat as absent.
    }

    const legacyPath = this.legacyFilePathFor(planName, chunkId);
    if (existsSync(legacyPath)) {
      const legacy = readJsonFileOrQuarantine<ChunkSession>(legacyPath);
      if (legacy) {
        if (!taskId || legacy.taskId === taskId) {
          return legacy;
        }
        return undefined;
      }
      // Corrupt and quarantined — fall through and treat as absent.
    }

    const matches = this.list(planName).filter((session) =>
      session.chunkId === chunkId && (taskId === undefined || session.taskId === taskId),
    );
    if (matches.length === 1) {
      return matches[0];
    }
    return undefined;
  }

  delete(planName: string, chunkId: string, taskId?: string): void {
    if (taskId) {
      this.deleteStorageKey(planName, chunkSessionStorageKey(chunkId, taskId));
      return;
    }

    const matches = this.list(planName).filter((session) => session.chunkId === chunkId);
    if (matches.length > 0) {
      for (const session of matches) {
        this.deleteStorageKey(session.planName, chunkSessionStorageKey(session.chunkId, session.taskId));
      }
      return;
    }

    this.deleteStorageKey(planName, chunkId);
  }

  list(planName?: string): ChunkSession[] {
    const plans = planName ? [planName] : this.listPlanNames();
    const sessions: ChunkSession[] = [];

    for (const plan of plans) {
      const planDir = join(this.rootDir, plan);
      if (!existsSync(planDir)) continue;

      for (const file of readdirSync(planDir)) {
        if (!file.endsWith('.json')) continue;
        // Corrupt files are quarantined and skipped instead of aborting the
        // whole listing — one damaged session must not hide the healthy ones.
        const session = readJsonFileOrQuarantine<ChunkSession>(join(planDir, file));
        if (session) {
          sessions.push(session);
        }
      }
    }

    return sessions;
  }

  /**
   * Lists the storage keys of every session file present on disk — including
   * quarantined (corrupt) ones. Callers like garbage collection use this
   * instead of list() so a session whose primary file is corrupt (quarantined,
   * not yet recovered) still counts as "present" and its snapshot history is
   * not deleted as orphaned.
   */
  listStorageKeys(planName?: string): string[] {
    const plans = planName ? [planName] : this.listPlanNames();
    const keys = new Set<string>();

    for (const plan of plans) {
      const planDir = join(this.rootDir, plan);
      if (!existsSync(planDir)) continue;

      for (const file of readdirSync(planDir)) {
        const key = sessionKeyFromFileName(file);
        if (key) {
          keys.add(`${plan}/${key}`);
          const taskScopedKey = this.taskScopedKeyFromLegacyFile(planDir, file, key);
          if (taskScopedKey) {
            keys.add(`${plan}/${taskScopedKey}`);
          }
        }
      }
    }

    return [...keys];
  }

  /**
   * Returns true when a plan contains a quarantined legacy `<chunkId>.json`
   * file. A corrupt legacy file cannot reveal its `taskId`, so callers that
   * would otherwise derive task-scoped snapshot keys must conservatively
   * preserve that plan's snapshots until the operator recovers or deletes the
   * quarantined session.
   */
  hasQuarantinedLegacySession(planName: string): boolean {
    const planDir = join(this.rootDir, planName);
    if (!existsSync(planDir)) {
      return false;
    }

    for (const file of readdirSync(planDir)) {
      const key = sessionKeyFromFileName(file);
      if (!key || file === `${key}.json`) {
        continue;
      }
      if (file.startsWith(`${key}.json.corrupt.`) && decodeURIComponent(key) === key) {
        return true;
      }
    }

    return false;
  }

  private deleteStorageKey(planName: string, key: string): void {
    const planDir = join(this.rootDir, planName);
    if (!existsSync(planDir)) {
      return;
    }

    for (const file of readdirSync(planDir)) {
      if (isSessionFileForKey(file, key)) {
        rmSync(join(planDir, file), { force: true });
      }
    }
  }

  private taskScopedKeyFromLegacyFile(planDir: string, file: string, key: string): string | undefined {
    // Only live legacy files can reveal the task-scoped storage key. Corrupt
    // quarantines are still represented by their filename-derived legacy key.
    if (file !== `${key}.json`) {
      return undefined;
    }

    try {
      const session = JSON.parse(readFileSync(join(planDir, file), 'utf-8')) as Partial<ChunkSession>;
      if (!session.chunkId || !session.taskId) {
        return undefined;
      }
      const taskScopedKey = chunkSessionStorageKey(session.chunkId, session.taskId);
      return taskScopedKey === key ? undefined : taskScopedKey;
    } catch {
      return undefined;
    }
  }

  private filePathFor(planName: string, chunkId: string, taskId?: string): string {
    return join(this.rootDir, planName, `${chunkSessionStorageKey(chunkId, taskId)}.json`);
  }

  private legacyFilePathFor(planName: string, chunkId: string): string {
    return join(this.rootDir, planName, `${chunkId}.json`);
  }

  private listPlanNames(): string[] {
    if (!existsSync(this.rootDir)) {
      return [];
    }

    return readdirSync(this.rootDir).filter((entry) => statSync(join(this.rootDir, entry)).isDirectory());
  }
}
