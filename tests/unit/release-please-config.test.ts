import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');

function readJson(relPath: string): unknown {
  return JSON.parse(readFileSync(resolve(ROOT, relPath), 'utf-8'));
}

const PACKAGE_DIRS = [
  'franken-brain',
  'franken-critique',
  'franken-governor',
  'franken-heartbeat',
  'franken-mcp',
  'franken-observer',
  'franken-orchestrator',
  'franken-planner',
  'franken-skills',
  'franken-types',
  'frankenfirewall',
] as const;

describe('release-please monorepo config', () => {
  const config = readJson('release-please-config.json') as {
    packages: Record<string, { 'release-type'?: string; component?: string }>;
  };
  const manifest = readJson('.release-please-manifest.json') as Record<string, string>;
  const rootPackage = readJson('package.json') as { version: string };

  it('config has root "." entry preserved', () => {
    expect(config.packages['.']).toBeDefined();
    expect(config.packages['.']['release-type']).toBe('node');
  });

  it('config has entries for all 11 packages', () => {
    for (const dir of PACKAGE_DIRS) {
      const key = `packages/${dir}`;
      expect(config.packages[key], `missing config entry for ${key}`).toBeDefined();
    }
  });

  it('config has at least 12 package entries (root + 11 modules)', () => {
    expect(Object.keys(config.packages).length).toBeGreaterThanOrEqual(12);
  });

  it('each package entry has release-type "node"', () => {
    for (const dir of PACKAGE_DIRS) {
      const key = `packages/${dir}`;
      expect(config.packages[key]?.['release-type'], `${key} missing release-type`).toBe('node');
    }
  });

  it('each package entry has a component name', () => {
    for (const dir of PACKAGE_DIRS) {
      const key = `packages/${dir}`;
      expect(config.packages[key]?.component, `${key} missing component`).toBeTruthy();
    }
  });

  it('manifest has root "." entry preserved', () => {
    expect(manifest['.']).toBe(rootPackage.version);
  });

  it('manifest has entries for all 11 packages', () => {
    for (const dir of PACKAGE_DIRS) {
      const key = `packages/${dir}`;
      expect(manifest[key], `missing manifest entry for ${key}`).toBeDefined();
    }
  });

  it('manifest has at least 12 entries', () => {
    expect(Object.keys(manifest).length).toBeGreaterThanOrEqual(12);
  });

  it('manifest versions match actual package.json versions', () => {
    for (const dir of PACKAGE_DIRS) {
      const key = `packages/${dir}`;
      const pkg = readJson(`packages/${dir}/package.json`) as { version: string };
      expect(manifest[key], `${key} version mismatch`).toBe(pkg.version);
    }
  });

  it('no per-module release-please-config.json files exist', () => {
    for (const dir of PACKAGE_DIRS) {
      const configPath = resolve(ROOT, `packages/${dir}/release-please-config.json`);
      expect(existsSync(configPath), `${configPath} should not exist`).toBe(false);
    }
  });

  it('no per-module .release-please-manifest.json files exist', () => {
    for (const dir of PACKAGE_DIRS) {
      const manifestPath = resolve(ROOT, `packages/${dir}/.release-please-manifest.json`);
      expect(existsSync(manifestPath), `${manifestPath} should not exist`).toBe(false);
    }
  });

  it('config JSON is valid (has $schema)', () => {
    expect(config).toHaveProperty('$schema');
  });
});
