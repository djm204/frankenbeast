import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

/**
 * Manages credential storage in .frankenbeast/.env.
 * Credentials are stored as KEY=VALUE lines, never in mcp.json.
 */
export class SkillCredentialStore {
  private readonly envPath: string;

  constructor(projectRoot: string) {
    this.envPath = join(projectRoot, '.frankenbeast', '.env');
  }

  /** Read all stored credentials */
  readAll(): Record<string, string> {
    if (!existsSync(this.envPath)) return {};
    return this.parseEnv(readFileSync(this.envPath, 'utf-8'));
  }

  /** Set multiple credential values, preserving existing ones */
  setMany(credentials: Record<string, string>): void {
    const existing = this.readAll();
    const merged = { ...existing, ...credentials };
    this.writeEnv(merged);
  }

  /** Remove a credential by key */
  remove(key: string): void {
    const existing = this.readAll();
    delete existing[key];
    this.writeEnv(existing);
  }

  /** Check if a credential exists */
  has(key: string): boolean {
    return key in this.readAll();
  }

  private parseEnv(content: string): Record<string, string> {
    const result: Record<string, string> = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      result[key] = value;
    }
    return result;
  }

  private writeEnv(entries: Record<string, string>): void {
    mkdirSync(dirname(this.envPath), { recursive: true });
    const lines = Object.entries(entries).map(
      ([key, value]) => `${key}=${value}`,
    );
    writeFileSync(this.envPath, lines.join('\n') + '\n');
  }
}
