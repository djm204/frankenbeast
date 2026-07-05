import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');

function readJson(relPath: string): unknown {
  return JSON.parse(readFileSync(resolve(ROOT, relPath), 'utf-8'));
}

describe('release-please monorepo config', () => {
  const config = readJson('release-please-config.json') as {
    packages: Record<string, { 'release-type'?: string; component?: string }>;
  };
  const manifest = readJson('.release-please-manifest.json') as Record<string, string>;
  const rootPackage = readJson('package.json') as { version: string };
  const packageDirs = readdirSync(resolve(ROOT, 'packages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  it('config has root "." entry preserved', () => {
    expect(config.packages['.']).toBeDefined();
    expect(config.packages['.']['release-type']).toBe('node');
  });

  it('config has entries for every package release-managed in this repo', () => {
    for (const dir of packageDirs) {
      const key = `packages/${dir}`;
      expect(config.packages[key], `missing config entry for ${key}`).toBeDefined();
    }
  });

  it('config has at least 8 package entries (root + 7 modules)', () => {
    expect(Object.keys(config.packages).length).toBeGreaterThanOrEqual(8);
  });

  it('each package entry has release-type "node"', () => {
    for (const dir of packageDirs) {
      const key = `packages/${dir}`;
      expect(config.packages[key]?.['release-type'], `${key} missing release-type`).toBe('node');
    }
  });

  it('each package entry has a component name', () => {
    for (const dir of packageDirs) {
      const key = `packages/${dir}`;
      expect(config.packages[key]?.component, `${key} missing component`).toBeTruthy();
    }
  });

  it('manifest has root "." entry preserved', () => {
    expect(manifest['.']).toBe(rootPackage.version);
  });

  it('manifest has entries for every package release-managed in this repo', () => {
    for (const dir of packageDirs) {
      const key = `packages/${dir}`;
      expect(manifest[key], `missing manifest entry for ${key}`).toBeDefined();
    }
  });

  it('manifest has at least 8 entries', () => {
    expect(Object.keys(manifest).length).toBeGreaterThanOrEqual(8);
  });

  it('manifest versions match actual package.json versions', () => {
    for (const dir of packageDirs) {
      const key = `packages/${dir}`;
      const pkg = readJson(`packages/${dir}/package.json`) as { version: string };
      expect(manifest[key], `${key} version mismatch`).toBe(pkg.version);
    }
  });

  it('no per-module release-please-config.json files exist', () => {
    for (const dir of packageDirs) {
      const configPath = resolve(ROOT, `packages/${dir}/release-please-config.json`);
      expect(existsSync(configPath), `${configPath} should not exist`).toBe(false);
    }
  });

  it('no per-module .release-please-manifest.json files exist', () => {
    for (const dir of packageDirs) {
      const manifestPath = resolve(ROOT, `packages/${dir}/.release-please-manifest.json`);
      expect(existsSync(manifestPath), `${manifestPath} should not exist`).toBe(false);
    }
  });

  it('config JSON is valid (has $schema)', () => {
    expect(config).toHaveProperty('$schema');
  });
});
