import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES_DIR = resolve(ROOT, 'packages');

const readText = (relativePath: string) => readFileSync(resolve(ROOT, relativePath), 'utf8');
const readJson = <T>(relativePath: string): T => JSON.parse(readText(relativePath)) as T;

type WorkspacePackage = {
  dir: string;
  name: string;
};

const workspacePackages = (): WorkspacePackage[] => readdirSync(PACKAGES_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .filter((entry) => existsSync(resolve(PACKAGES_DIR, entry.name, 'package.json')))
  .map((entry) => {
    const packageJson = readJson<{ name?: string }>(`packages/${entry.name}/package.json`);

    expect(packageJson.name, `packages/${entry.name}/package.json should declare a package name`).toBeDefined();

    return { dir: entry.name, name: packageJson.name ?? '' };
  })
  .sort((left, right) => left.dir.localeCompare(right.dir));

const claudePackageMapBlock = () => {
  const claude = readText('CLAUDE.md');
  const match = claude.match(/```\npackages\/\n(?<map>[\s\S]*?)```/u);

  expect(match?.groups?.map, 'CLAUDE.md should include the packages/ map fenced block').toBeDefined();

  return match?.groups?.map ?? '';
};

const claudePackageMapEntries = () => claudePackageMapBlock()
  .split('\n')
  .map((line) => line.match(/^[├└]── (?<dir>[^/]+)\/\s+# (?<packageName>[^:]+):/u)?.groups)
  .filter((entry): entry is { dir: string; packageName: string } => entry !== undefined)
  .map(({ dir, packageName }) => ({ dir, name: packageName.trim() }))
  .sort((left, right) => left.dir.localeCompare(right.dir));

describe('issue #957 CLAUDE monorepo package map', () => {
  it('matches the exact direct packages/* workspace directory set', () => {
    expect(claudePackageMapEntries().map(({ dir }) => dir)).toEqual(workspacePackages().map(({ dir }) => dir));
  });

  it('uses each workspace package.json name in the active package map', () => {
    expect(claudePackageMapEntries()).toEqual(workspacePackages());
  });

  it('does not describe retired pre-consolidation packages as active workspaces', () => {
    const packageMap = claudePackageMapBlock();

    expect(readText('CLAUDE.md')).not.toContain('All 11 packages live under `packages/`');

    for (const retiredPackage of [
      'frankenfirewall/',
      'franken-skills/',
      'franken-heartbeat/',
      'franken-mcp/',
      'franken-comms/',
    ]) {
      expect(packageMap, `${retiredPackage} should not appear in the active package map`).not.toContain(retiredPackage);
    }
  });

  it('uses current workspace package names in the dependency guidance', () => {
    const claude = readText('CLAUDE.md');

    expect(claude).toContain('e.g., `@franken/types`');
    expect(claude).not.toContain('@frankenbeast/types');
  });
});
