import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');

function readJson(relPath: string): unknown {
  return JSON.parse(readFileSync(resolve(ROOT, relPath), 'utf-8'));
}

function expandWorkspacePackageDirs(workspaces: string[]): string[] {
  const packageDirs = new Set<string>();

  for (const workspace of workspaces) {
    if (workspace === 'packages/*') {
      for (const entry of readdirSync(resolve(ROOT, 'packages'), { withFileTypes: true })) {
        if (entry.isDirectory()) {
          packageDirs.add(`packages/${entry.name}`);
        }
      }
      continue;
    }

    if (workspace.startsWith('packages/') && !workspace.includes('*')) {
      packageDirs.add(workspace);
    }
  }

  return [...packageDirs].sort();
}

describe('release-please monorepo config', () => {
  const config = readJson('release-please-config.json') as {
    packages: Record<
      string,
      { 'release-type'?: string; component?: string; 'exclude-paths'?: string[] }
    >;
  };
  const manifest = readJson('.release-please-manifest.json') as Record<string, string>;
  const rootPackage = readJson('package.json') as { version: string; workspaces: string[] };
  const packageDirs = expandWorkspacePackageDirs(rootPackage.workspaces);
  const releasePackageDirs = packageDirs.filter((dir) => dir !== '.');

  it('config has root "." entry preserved', () => {
    expect(config.packages['.']).toBeDefined();
    expect(config.packages['.']['release-type']).toBe('node');
  });

  it('config has an explicit release policy for every workspace package', () => {
    for (const dir of releasePackageDirs) {
      expect(config.packages[dir], `missing config entry for ${dir}`).toBeDefined();
    }

    const packageKeys = Object.keys(config.packages).filter((key) => key !== '.').sort();
    expect(packageKeys).toEqual(releasePackageDirs);
  });

  it('root release excludes every workspace package path', () => {
    expect(config.packages['.']['exclude-paths']?.sort()).toEqual(releasePackageDirs);
  });

  it('each package entry has release-type "node"', () => {
    for (const dir of releasePackageDirs) {
      expect(config.packages[dir]?.['release-type'], `${dir} missing release-type`).toBe('node');
    }
  });

  it('each package entry has a component name', () => {
    for (const dir of releasePackageDirs) {
      expect(config.packages[dir]?.component, `${dir} missing component`).toBeTruthy();
    }
  });

  it('manifest has root "." entry preserved', () => {
    expect(manifest['.']).toBe(rootPackage.version);
  });

  it('manifest has entries for every release-managed workspace package', () => {
    for (const dir of releasePackageDirs) {
      expect(manifest[dir], `missing manifest entry for ${dir}`).toBeDefined();
    }

    const manifestPackageKeys = Object.keys(manifest).filter((key) => key !== '.').sort();
    expect(manifestPackageKeys).toEqual(releasePackageDirs);
  });

  it('manifest versions match actual package.json versions', () => {
    for (const dir of releasePackageDirs) {
      const pkg = readJson(`${dir}/package.json`) as { version: string };
      expect(manifest[dir], `${dir} version mismatch`).toBe(pkg.version);
    }
  });

  it('user-facing release packages are publishable to npm', () => {
    for (const dir of ['franken-mcp-suite', 'franken-web', 'live-bench']) {
      const pkg = readJson(`packages/${dir}/package.json`) as {
        private?: boolean;
        publishConfig?: { access?: string };
      };
      expect(pkg.private, `packages/${dir} must not be private`).not.toBe(true);
      expect(pkg.publishConfig?.access, `packages/${dir} must publish publicly`).toBe('public');
    }
  });

  it('live-bench publishes fixtures referenced by its bundled corpus', () => {
    const pkg = readJson('packages/live-bench/package.json') as { files?: string[] };
    expect(pkg.files).toEqual(expect.arrayContaining(['corpus', 'fixtures']));
  });

  it('no per-module release-please-config.json files exist', () => {
    for (const dir of releasePackageDirs) {
      const configPath = resolve(ROOT, `${dir}/release-please-config.json`);
      expect(existsSync(configPath), `${configPath} should not exist`).toBe(false);
    }
  });

  it('no per-module .release-please-manifest.json files exist', () => {
    for (const dir of releasePackageDirs) {
      const manifestPath = resolve(ROOT, `${dir}/.release-please-manifest.json`);
      expect(existsSync(manifestPath), `${manifestPath} should not exist`).toBe(false);
    }
  });

  it('config JSON is valid (has $schema)', () => {
    expect(config).toHaveProperty('$schema');
  });
});
