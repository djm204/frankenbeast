import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  existsSync,
  lstatSync,
  symlinkSync,
  chmodSync,
  statSync,
  readdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SkillConfigStore } from '../../../src/skills/skill-config-store.js';
import { SkillManager } from '../../../src/skills/skill-manager.js';

describe('SkillConfigStore', () => {
  let tempDir: string;
  let configDir: string;
  let store: SkillConfigStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'skill-config-test-'));
    configDir = join(tempDir, '.fbeast');
    store = new SkillConfigStore(configDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('getEnabledSkills()', () => {
    it('returns empty set when no config file exists', () => {
      const result = store.getEnabledSkills();
      expect(result).toEqual(new Set());
    });

    it('reads back saved skills', () => {
      store.save(new Set(['github', 'linear']));
      const result = store.getEnabledSkills();
      expect(result).toEqual(new Set(['github', 'linear']));
    });

    it('handles corrupt JSON gracefully (returns empty set)', () => {
      mkdirSync(configDir, { recursive: true });
      writeFileSync(join(configDir, 'config.json'), 'not valid json!!!');
      const result = store.getEnabledSkills();
      expect(result).toEqual(new Set());
    });

    it('handles missing skills field gracefully', () => {
      mkdirSync(configDir, { recursive: true });
      writeFileSync(
        join(configDir, 'config.json'),
        JSON.stringify({ theme: 'dark' }),
      );
      const result = store.getEnabledSkills();
      expect(result).toEqual(new Set());
    });

    it('handles non-object JSON root gracefully (e.g. null)', () => {
      mkdirSync(configDir, { recursive: true });
      writeFileSync(join(configDir, 'config.json'), 'null');
      const result = store.getEnabledSkills();
      expect(result).toEqual(new Set());
    });

    it('filters out non-string values in enabled array', () => {
      mkdirSync(configDir, { recursive: true });
      writeFileSync(
        join(configDir, 'config.json'),
        JSON.stringify({ skills: { enabled: ['github', 42, null, 'linear'] } }),
      );
      const result = store.getEnabledSkills();
      expect(result).toEqual(new Set(['github', 'linear']));
    });
  });

  describe('save()', () => {
    it('refuses to copy a symlink target into a local config', () => {
      mkdirSync(configDir, { recursive: true });
      const linkedConfigPath = join(tempDir, 'linked-config.json');
      writeFileSync(
        linkedConfigPath,
        JSON.stringify({ theme: 'dark', skills: { enabled: ['old'] } }, null, 2) + '\n',
      );
      chmodSync(linkedConfigPath, 0o600);
      const configPath = join(configDir, 'config.json');
      symlinkSync(linkedConfigPath, configPath);

      expect(() => store.save(new Set(['github']))).toThrow(/symlinked config/i);

      expect(lstatSync(configPath).isSymbolicLink()).toBe(true);
      expect(JSON.parse(readFileSync(linkedConfigPath, 'utf-8'))).toEqual({
        theme: 'dark',
        skills: { enabled: ['old'] },
      });
    });

    it('refuses to replace a dangling symlink with a local config', () => {
      mkdirSync(configDir, { recursive: true });
      const configPath = join(configDir, 'config.json');
      const missingTargetPath = join(tempDir, 'missing-config.json');
      symlinkSync(missingTargetPath, configPath);

      expect(() => store.save(new Set(['github']))).toThrow(/symlinked config/i);

      expect(lstatSync(configPath).isSymbolicLink()).toBe(true);
      expect(existsSync(missingTargetPath)).toBe(false);
    });

    it('refuses to overwrite a corrupt existing config', () => {
      mkdirSync(configDir, { recursive: true });
      const configPath = join(configDir, 'config.json');
      const truncatedConfig = '{"theme":"dark","skills":{"enabled":["github"]';
      writeFileSync(configPath, truncatedConfig);

      expect(() => store.save(new Set(['linear']))).toThrow(/corrupt/i);
      expect(readFileSync(configPath, 'utf-8')).toBe(truncatedConfig);
    });

    it('creates config.json with skills.enabled array', () => {
      store.save(new Set(['github', 'linear']));
      const configPath = join(configDir, 'config.json');
      expect(existsSync(configPath)).toBe(true);
      const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(raw.skills.enabled).toEqual(['github', 'linear']);
    });

    it('creates config directory if it does not exist', () => {
      expect(existsSync(configDir)).toBe(false);
      store.save(new Set(['github']));
      expect(existsSync(configDir)).toBe(true);
    });

    it('sorts skill names alphabetically', () => {
      store.save(new Set(['zeta', 'alpha', 'mid']));
      const raw = JSON.parse(
        readFileSync(join(configDir, 'config.json'), 'utf-8'),
      );
      expect(raw.skills.enabled).toEqual(['alpha', 'mid', 'zeta']);
    });

    it('preserves other fields in config.json on save', () => {
      mkdirSync(configDir, { recursive: true });
      writeFileSync(
        join(configDir, 'config.json'),
        JSON.stringify({ theme: 'dark', version: 2 }, null, 2) + '\n',
      );

      store.save(new Set(['github']));

      const raw = JSON.parse(
        readFileSync(join(configDir, 'config.json'), 'utf-8'),
      );
      expect(raw.theme).toBe('dark');
      expect(raw.version).toBe(2);
      expect(raw.skills.enabled).toEqual(['github']);
    });

    it('preserves an existing mode even when the process umask would mask it', () => {
      mkdirSync(configDir, { recursive: true });
      const configPath = join(configDir, 'config.json');
      writeFileSync(configPath, JSON.stringify({ skills: { enabled: ['old'] } }));
      chmodSync(configPath, 0o660);
      const previousUmask = process.umask(0o077);

      try {
        store.save(new Set(['github']));
      } finally {
        process.umask(previousUmask);
      }

      expect(statSync(configPath).mode & 0o777).toBe(0o660);
    });

    it('refuses to replace an existing read-only config', () => {
      mkdirSync(configDir, { recursive: true });
      const configPath = join(configDir, 'config.json');
      const original = JSON.stringify({ skills: { enabled: ['old'] } });
      writeFileSync(configPath, original);
      chmodSync(configPath, 0o444);

      expect(() => store.save(new Set(['github']))).toThrow(/read-only/i);
      expect(readFileSync(configPath, 'utf-8')).toBe(original);
      expect(statSync(configPath).mode & 0o777).toBe(0o444);
    });

    it('recovers from non-object JSON root on save (e.g. null)', () => {
      mkdirSync(configDir, { recursive: true });
      writeFileSync(join(configDir, 'config.json'), 'null');
      store.save(new Set(['github']));
      const raw = JSON.parse(readFileSync(join(configDir, 'config.json'), 'utf-8'));
      expect(raw.skills.enabled).toEqual(['github']);
    });

    it('preserves other fields within skills object on save', () => {
      mkdirSync(configDir, { recursive: true });
      writeFileSync(
        join(configDir, 'config.json'),
        JSON.stringify({ skills: { catalog: 'v3', enabled: ['old'] } }, null, 2) + '\n',
      );

      store.save(new Set(['github']));

      const raw = JSON.parse(
        readFileSync(join(configDir, 'config.json'), 'utf-8'),
      );
      expect(raw.skills.catalog).toBe('v3');
      expect(raw.skills.enabled).toEqual(['github']);
    });
  });

  describe('round-trip', () => {
    it('save then read returns same set', () => {
      const original = new Set(['alpha', 'beta', 'gamma']);
      store.save(original);
      const loaded = store.getEnabledSkills();
      expect(loaded).toEqual(original);
    });

    it('empty set round-trips correctly', () => {
      store.save(new Set());
      const loaded = store.getEnabledSkills();
      expect(loaded).toEqual(new Set());
    });
  });
});

describe('SkillManager + SkillConfigStore integration', () => {
  let tempDir: string;
  let skillsDir: string;
  let configDir: string;
  let store: SkillConfigStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'skill-mgr-config-test-'));
    skillsDir = join(tempDir, 'skills');
    configDir = join(tempDir, '.fbeast');
    store = new SkillConfigStore(configDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  const installSkill = async (manager: SkillManager, name: string) => {
    await manager.install({
      name,
      description: `${name} skill`,
      provider: 'cli',
      installConfig: { command: 'npx' },
      authFields: [],
    });
  };

  it('reads initial enabled set from configStore when constructor set is empty', async () => {
    // Pre-save some skills
    store.save(new Set(['github', 'linear']));

    const manager = new SkillManager(skillsDir, new Set(), store);
    // Install so getEnabledSkills() doesn't filter them out
    await installSkill(manager, 'github');
    await installSkill(manager, 'linear');

    expect(manager.getEnabledSkills()).toContain('github');
    expect(manager.getEnabledSkills()).toContain('linear');
  });

  it('ignores configStore when constructor set is non-empty', async () => {
    store.save(new Set(['github', 'linear']));

    const manager = new SkillManager(
      skillsDir,
      new Set(['only-this']),
      store,
    );
    await installSkill(manager, 'github');
    await installSkill(manager, 'linear');
    await installSkill(manager, 'only-this');

    expect(manager.getEnabledSkills()).toEqual(['only-this']);
    expect(manager.getEnabledSkills()).not.toContain('github');
  });

  it('enable() persists via configStore', async () => {
    const manager = new SkillManager(skillsDir, new Set(), store);
    await installSkill(manager, 'github');

    manager.enable('github');

    // Verify persisted
    const persisted = store.getEnabledSkills();
    expect(persisted).toContain('github');
  });

  it('disable() persists via configStore', async () => {
    const manager = new SkillManager(skillsDir, new Set(), store);
    await installSkill(manager, 'github');

    manager.enable('github');
    manager.disable('github');

    const persisted = store.getEnabledSkills();
    expect(persisted).not.toContain('github');
  });

  it('keeps in-memory toggle state unchanged when persistence fails', async () => {
    const manager = new SkillManager(skillsDir, new Set(), store);
    await installSkill(manager, 'github');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'config.json'), '{"skills":');

    expect(() => manager.enable('github')).toThrow(/corrupt/i);
    expect(manager.getEnabledSkills()).not.toContain('github');

    rmSync(join(configDir, 'config.json'));
    manager.enable('github');
    writeFileSync(join(configDir, 'config.json'), '{"skills":');

    expect(() => manager.disable('github')).toThrow(/corrupt/i);
    expect(manager.getEnabledSkills()).toContain('github');
  });

  it('remove() persists via configStore', async () => {
    const manager = new SkillManager(skillsDir, new Set(), store);
    await installSkill(manager, 'github');

    manager.enable('github');
    expect(store.getEnabledSkills()).toContain('github');

    manager.remove('github');

    // Removal should also persist — 'github' no longer in config
    const persisted = store.getEnabledSkills();
    expect(persisted).not.toContain('github');
  });

  it('does not delete skill files when persistence fails', async () => {
    const manager = new SkillManager(skillsDir, new Set(['github']), store);
    await installSkill(manager, 'github');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'config.json'), '{"skills":');

    expect(() => manager.remove('github')).toThrow(/corrupt/i);
    expect(manager.exists('github')).toBe(true);
    expect(manager.getEnabledSkills()).toContain('github');
  });

  it('does not delete skill files while an atomic config write journal is active', async () => {
    const manager = new SkillManager(skillsDir, new Set(['github']), store);
    await installSkill(manager, 'github');
    mkdirSync(configDir, { recursive: true });
    const configPath = join(configDir, 'config.json');
    const now = new Date().toISOString();
    writeFileSync(
      `${configPath}.journal`,
      JSON.stringify({
        schemaVersion: 1,
        targetPath: configPath,
        tempPath: `${configPath}.tmp.1.00000000-0000-4000-8000-000000000000`,
        phase: 'preparing',
        startedAt: now,
        updatedAt: now,
      }),
    );

    expect(() => manager.remove('github')).toThrow(/still preparing/i);
    expect(manager.exists('github')).toBe(true);
    expect(manager.getEnabledSkills()).toContain('github');
  });

  it('preflights the complete atomic write path without leaving probe files', async () => {
    const manager = new SkillManager(skillsDir, new Set(['github']), store);
    await installSkill(manager, 'github');
    store.save(new Set(['github']));

    store.assertSaveable();

    expect(readdirSync(configDir).filter((name) => name.includes('write-probe'))).toEqual([]);
    expect(manager.exists('github')).toBe(true);
    expect(store.getEnabledSkills()).toContain('github');
  });

  it('does not delete skill files when the atomic write probe fails', async () => {
    class FailingProbeConfigStore extends SkillConfigStore {
      protected override probeAtomicWrite(): void {
        throw new Error('injected atomic write probe failure');
      }
    }
    const failingStore = new FailingProbeConfigStore(configDir);
    failingStore.save(new Set(['github']));
    const manager = new SkillManager(skillsDir, new Set(['github']), failingStore);
    await installSkill(manager, 'github');

    expect(() => manager.remove('github')).toThrow(/injected atomic write probe failure/);
    expect(manager.exists('github')).toBe(true);
    expect(manager.getEnabledSkills()).toContain('github');
    expect(failingStore.getEnabledSkills()).toContain('github');
  });

  it('does not delete skill files when the existing config is read-only', async () => {
    const manager = new SkillManager(skillsDir, new Set(['github']), store);
    await installSkill(manager, 'github');
    store.save(new Set(['github']));
    const configPath = join(configDir, 'config.json');
    chmodSync(configPath, 0o444);

    expect(() => manager.remove('github')).toThrow(/read-only/i);
    expect(manager.exists('github')).toBe(true);
    expect(manager.getEnabledSkills()).toContain('github');
    expect(store.getEnabledSkills()).toContain('github');
  });

  it('does not persist or mutate toggle state when file removal fails', async () => {
    store.save(new Set(['github']));
    class FailingRemoveSkillManager extends SkillManager {
      protected override removeSkillPath(): void {
        throw new Error('injected removal failure');
      }
    }
    const manager = new FailingRemoveSkillManager(skillsDir, new Set(['github']), store);
    await installSkill(manager, 'github');

    expect(() => manager.remove('github')).toThrow(/injected removal failure/);
    expect(manager.getEnabledSkills()).toContain('github');
    expect(store.getEnabledSkills()).toContain('github');
    expect(manager.exists('github')).toBe(true);
  });

  it('works without configStore (backward compatible)', async () => {
    const manager = new SkillManager(skillsDir, new Set());
    await installSkill(manager, 'github');

    manager.enable('github');
    expect(manager.getEnabledSkills()).toContain('github');

    manager.disable('github');
    expect(manager.getEnabledSkills()).not.toContain('github');
  });

  it('run config skills override persisted defaults (precedence)', async () => {
    // Persisted config has github + linear
    store.save(new Set(['github', 'linear']));

    // Run config says only 'sentry' is enabled
    const runConfigSkills = new Set(['sentry']);
    const manager = new SkillManager(skillsDir, runConfigSkills, store);

    await installSkill(manager, 'github');
    await installSkill(manager, 'linear');
    await installSkill(manager, 'sentry');

    // Only sentry should be enabled (run config takes precedence)
    expect(manager.getEnabledSkills()).toEqual(['sentry']);
  });
});
