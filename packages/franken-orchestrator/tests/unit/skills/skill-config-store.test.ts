import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  existsSync,
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
