import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES_DIR = resolve(ROOT, 'packages');

const readText = (relativePath: string) => readFileSync(resolve(ROOT, relativePath), 'utf8');
const readJson = <T>(relativePath: string): T => JSON.parse(readText(relativePath)) as T;

const workspacePackageDirs = () => readdirSync(PACKAGES_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .filter((entry) => readJson<{ name?: string }>(`packages/${entry.name}/package.json`).name !== undefined)
  .map((entry) => entry.name)
  .sort();

const claudePackageMapBlock = () => {
  const claude = readText('CLAUDE.md');
  const match = claude.match(/```\npackages\/\n(?<map>[\s\S]*?)```/u);

  expect(match?.groups?.map, 'CLAUDE.md should include the packages/ map fenced block').toBeDefined();

  return match?.groups?.map ?? '';
};

describe('issue #957 CLAUDE monorepo package map', () => {
  it('lists every direct packages/* workspace directory exactly once', () => {
    const packageMap = claudePackageMapBlock();

    for (const packageDir of workspacePackageDirs()) {
      const occurrences = packageMap.match(new RegExp(`\\b${packageDir}/`, 'gu')) ?? [];
      expect(occurrences.length, `CLAUDE.md package map should list packages/${packageDir}/ exactly once`).toBe(1);
    }
  });

  it('does not describe retired pre-consolidation packages as active workspaces', () => {
    const packageMap = claudePackageMapBlock();

    expect(readText('CLAUDE.md')).not.toContain('All 11 packages live under `packages/`');

    for (const retiredPackage of ['frankenfirewall/', 'franken-skills/', 'franken-heartbeat/', 'franken-mcp/']) {
      expect(packageMap, `${retiredPackage} should not appear in the active package map`).not.toContain(retiredPackage);
    }
  });

  it('uses current workspace package names in the dependency guidance', () => {
    const claude = readText('CLAUDE.md');

    expect(claude).toContain('e.g., `@franken/types`');
    expect(claude).not.toContain('@frankenbeast/types');
  });
});
