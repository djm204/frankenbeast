import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..', '..');

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(resolve(ROOT, relativePath), 'utf-8')) as T;
}

function parseVersion(versionRange: string): [number, number, number] {
  const match = versionRange.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    throw new Error(`Could not parse semver from ${versionRange}`);
  }

  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function isAtLeast(versionRange: string, minimum: [number, number, number]): boolean {
  const version = parseVersion(versionRange);

  for (let index = 0; index < minimum.length; index += 1) {
    if (version[index] > minimum[index]) {
      return true;
    }
    if (version[index] < minimum[index]) {
      return false;
    }
  }

  return true;
}

describe('web dev-server dependency policy', () => {
  it('pins the Vite/esbuild dev-server chain to patched versions', () => {
    const rootPackage = readJson<{
      overrides?: Record<string, string>;
    }>('package.json');
    const webPackage = readJson<{
      devDependencies?: Record<string, string>;
    }>('packages/franken-web/package.json');

    expect(webPackage.devDependencies?.vite).toBe(rootPackage.overrides?.vite);
    expect(rootPackage.overrides?.esbuild).toBeTruthy();
    expect(isAtLeast(rootPackage.overrides?.vite ?? '', [8, 1, 3])).toBe(true);
    expect(isAtLeast(rootPackage.overrides?.esbuild ?? '', [0, 28, 1])).toBe(true);
  });

  it('keeps the lockfile resolved to the patched Vite and esbuild versions used by npm audit', () => {
    const rootPackage = readJson<{
      overrides?: Record<string, string>;
    }>('package.json');
    const lockfile = readJson<{
      packages?: Record<string, { version?: string }>;
    }>('package-lock.json');

    const lockedVite = lockfile.packages?.['node_modules/vite']?.version;
    const lockedEsbuild = lockfile.packages?.['node_modules/esbuild']?.version;

    expect(lockedVite).toBe(rootPackage.overrides?.vite?.replace(/^\D+/, ''));
    expect(lockedEsbuild).toBe(rootPackage.overrides?.esbuild?.replace(/^\D+/, ''));
  });
});
