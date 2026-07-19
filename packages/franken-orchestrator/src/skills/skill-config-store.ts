import { existsSync, readFileSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { atomicWriteFileSync } from '../session/atomic-file.js';

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

    let existing: Record<string, unknown> = {};
    if (existsSync(this.configPath)) {
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

    existing.skills = {
      ...((existing.skills as Record<string, unknown>) ?? {}),
      enabled: [...enabledSkills].sort(),
    };

    const mode = existsSync(this.configPath)
      ? statSync(this.configPath).mode & 0o777
      : 0o600;
    atomicWriteFileSync(this.configPath, JSON.stringify(existing, null, 2) + '\n', { mode });
  }
}
