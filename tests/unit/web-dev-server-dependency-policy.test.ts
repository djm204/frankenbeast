import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..', '..');

// Patched floors that carry the audited Vite/esbuild dev-server fixes.
const VITE_FLOOR: [number, number, number] = [8, 1, 3];
const ESBUILD_FLOOR: [number, number, number] = [0, 28, 1];

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(resolve(ROOT, relativePath), 'utf-8')) as T;
}

interface ParsedVersion {
  version: [number, number, number];
  prerelease: boolean;
}

function parseVersion(versionRange: string): ParsedVersion {
  const match = versionRange.match(/(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?/);
  if (!match) {
    throw new Error(`Could not parse semver from ${versionRange}`);
  }

  return {
    version: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: Boolean(match[4]),
  };
}

function isAtLeast(versionRange: string, minimum: [number, number, number]): boolean {
  const { version, prerelease } = parseVersion(versionRange);

  // Prereleases have lower semver precedence than the associated final release
  // and may not contain the audited fix, so they must never satisfy the floor.
  if (prerelease) {
    return false;
  }

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
    expect(isAtLeast(rootPackage.overrides?.vite ?? '', VITE_FLOOR)).toBe(true);
    expect(isAtLeast(rootPackage.overrides?.esbuild ?? '', ESBUILD_FLOOR)).toBe(true);
  });

  it('keeps the lockfile resolved to the patched Vite and esbuild versions used by npm audit', () => {
    const lockfile = readJson<{
      packages?: Record<string, { version?: string }>;
    }>('package-lock.json');

    const lockedVite = lockfile.packages?.['node_modules/vite']?.version;
    const lockedEsbuild = lockfile.packages?.['node_modules/esbuild']?.version;

    expect(lockedVite).toBeTruthy();
    expect(lockedEsbuild).toBeTruthy();
    // Accept any newer patched release that npm may resolve within the manifest
    // ranges, while still enforcing the audited patched floor.
    expect(isAtLeast(lockedVite ?? '', VITE_FLOOR)).toBe(true);
    expect(isAtLeast(lockedEsbuild ?? '', ESBUILD_FLOOR)).toBe(true);
  });
});
