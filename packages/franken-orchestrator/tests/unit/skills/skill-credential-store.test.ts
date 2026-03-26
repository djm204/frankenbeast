import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SkillCredentialStore } from '../../../src/skills/skill-credential-store.js';

describe('SkillCredentialStore', () => {
  let tempDir: string;
  let store: SkillCredentialStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'cred-test-'));
    store = new SkillCredentialStore(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('readAll returns empty when no .env file', () => {
    expect(store.readAll()).toEqual({});
  });

  it('setMany creates .frankenbeast/.env with credentials', () => {
    store.setMany({ GITHUB_TOKEN: 'ghp_abc', LINEAR_KEY: 'lin_xyz' });
    const content = readFileSync(
      join(tempDir, '.frankenbeast', '.env'),
      'utf-8',
    );
    expect(content).toContain('GITHUB_TOKEN=ghp_abc');
    expect(content).toContain('LINEAR_KEY=lin_xyz');
  });

  it('setMany preserves existing credentials', () => {
    store.setMany({ GITHUB_TOKEN: 'ghp_abc' });
    store.setMany({ LINEAR_KEY: 'lin_xyz' });
    const all = store.readAll();
    expect(all['GITHUB_TOKEN']).toBe('ghp_abc');
    expect(all['LINEAR_KEY']).toBe('lin_xyz');
  });

  it('setMany overwrites existing keys', () => {
    store.setMany({ TOKEN: 'old' });
    store.setMany({ TOKEN: 'new' });
    expect(store.readAll()['TOKEN']).toBe('new');
  });

  it('remove deletes a credential', () => {
    store.setMany({ A: '1', B: '2' });
    store.remove('A');
    const all = store.readAll();
    expect(all['A']).toBeUndefined();
    expect(all['B']).toBe('2');
  });

  it('has checks credential existence', () => {
    store.setMany({ TOKEN: 'val' });
    expect(store.has('TOKEN')).toBe(true);
    expect(store.has('MISSING')).toBe(false);
  });
});
