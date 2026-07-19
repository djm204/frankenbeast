import { existsSync, readFileSync, mkdirSync, statSync, unlinkSync, lstatSync } from 'node:fs';
import { join, dirname } from 'node:path';
import {
  atomicWriteFileSync,
  recoverStateWriteTransaction,
} from '../session/atomic-file.js';

/**
 * Persistent store for skill toggle state.
 *
 * Reads/writes `.fbeast/config.json` (or a custom config directory).
 * The config file may contain other fields besides `skills` — those are
 * preserved across saves.
 *
 * Precedence (handled by SkillManager, not here):
 *   run config `skills:` field > persisted defaults > empty
 */
export class SkillConfigStore {
  private static probeCounter = 0;
  private readonly configPath: string;

  constructor(configDir: string) {
    this.configPath = join(configDir, 'config.json');
  }

  /**
   * Returns the set of skill names marked as enabled in the persisted config.
   * Never throws — corrupt or missing files return an empty set.
   */
  getEnabledSkills(): Set<string> {
    try {
      if (!existsSync(this.configPath)) return new Set();
      const raw = JSON.parse(readFileSync(this.configPath, 'utf-8'));
      const enabled = raw?.skills?.enabled;
      if (!Array.isArray(enabled)) return new Set();
      return new Set(enabled.filter((s: unknown) => typeof s === 'string'));
    } catch {
      return new Set(); // corrupt file — graceful fallback
    }
  }

  /**
   * Persists the given set of enabled skill names to config.json.
   * Creates the config directory if it does not exist.
   * Preserves all other fields in the existing config file.
   */
  save(enabledSkills: Set<string>): void {
    mkdirSync(dirname(this.configPath), { recursive: true });

    const existing = this.readExistingForSave();
    existing.skills = {
      ...((existing.skills as Record<string, unknown>) ?? {}),
      enabled: [...enabledSkills].sort(),
    };

    const mode = this.configModeForWrite();
    atomicWriteFileSync(this.configPath, JSON.stringify(existing, null, 2) + '\n', { mode });
  }

  assertSaveable(): void {
    mkdirSync(dirname(this.configPath), { recursive: true });
    this.readExistingForSave();
    this.configModeForWrite();
    const recovery = recoverStateWriteTransaction(this.configPath);
    if (recovery?.action === 'retained-active-journal') {
      throw new Error(recovery.reason);
    }

    // remove() deletes skill files before persisting their disabled state. Probe
    // the complete sidecar/temp/rename path in the same directory first so a
    // directory that cannot support atomic writes fails before those files are
    // touched. The real save still performs its own recovery for race safety.
    const probePath = `${this.configPath}.write-probe.${process.pid}.${SkillConfigStore.probeCounter++}`;
    try {
      this.probeAtomicWrite(probePath);
    } finally {
      try {
        unlinkSync(probePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
  }

  protected probeAtomicWrite(probePath: string): void {
    atomicWriteFileSync(probePath, '', { mode: 0o600 });
  }

  private configModeForWrite(): number {
    if (!existsSync(this.configPath)) return 0o600;
    const mode = statSync(this.configPath).mode & 0o777;
    if ((mode & 0o222) === 0) {
      throw new Error('Cannot save skill toggles because the existing config is read-only');
    }
    return mode;
  }

  private readExistingForSave(): Record<string, unknown> {
    let existing: Record<string, unknown> = {};
    if (existsSync(this.configPath)) {
      if (lstatSync(this.configPath).isSymbolicLink()) {
        throw new Error('Cannot save skill toggles because symlinked config files are not supported');
      }
      try {
        const parsed = JSON.parse(readFileSync(this.configPath, 'utf-8'));
        // Normalize: only use parsed value if it's a plain object
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
          existing = parsed as Record<string, unknown>;
        }
      } catch (error) {
        throw new Error('Cannot save skill toggles because the existing config is corrupt or unreadable', {
          cause: error,
        });
      }
    }
    return existing;
  }
}
