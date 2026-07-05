import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const readJson = (rel: string) =>
  JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
const readPkg = readJson;

const majorMinorPatch = (version: string) => {
  const match = version.match(/^(?:\^|~)?(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`Unsupported semver range: ${version}`);
  }
  return match.slice(1).map(Number) as [number, number, number];
};

const isAtLeast = (version: string, minimum: string) => {
  const current = majorMinorPatch(version);
  const target = majorMinorPatch(minimum);
  for (let index = 0; index < current.length; index += 1) {
    if (current[index] > target[index]) return true;
    if (current[index] < target[index]) return false;
  }
  return true;
};

describe('npm workspaces configuration', () => {
  describe('root package.json', () => {
    const rootPkg = readPkg('package.json');

    it('has workspaces field set to packages/*', () => {
      expect(rootPkg.workspaces).toEqual(['packages/*']);
    });

    it('remains private (required for workspaces)', () => {
      expect(rootPkg.private).toBe(true);
    });

    it('pins ws to a security-fixed version for all workspace consumers', () => {
      expect(rootPkg.overrides?.ws).toBeDefined();
      expect(isAtLeast(rootPkg.overrides.ws, '8.21.0')).toBe(true);
    });

    it('pins Vite to a security-fixed version for Vitest consumers', () => {
      expect(rootPkg.overrides?.vite).toBeDefined();
      expect(isAtLeast(rootPkg.overrides.vite, '8.1.3')).toBe(true);
    });
  });

  describe('Vitest toolchain security floor', () => {
    const minimumVitest = '4.1.9';
    const packageJsonPaths = [
      'package.json',
      ...readdirSync(join(ROOT, 'packages'), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => `packages/${entry.name}/package.json`),
    ];

    it('keeps every Vitest and coverage dependency on the non-vulnerable floor', () => {
      for (const path of packageJsonPaths) {
        const pkg = readPkg(path);
        const devDependencies = pkg.devDependencies ?? {};

        for (const dependencyName of ['vitest', '@vitest/coverage-v8']) {
          const version = devDependencies[dependencyName];
          if (version === undefined) continue;

          expect(
            isAtLeast(version, minimumVitest),
            `${dependencyName} in ${path} must stay >= ${minimumVitest}`,
          ).toBe(true);
        }
      }
    });

    it('keeps the lockfile resolved to the same non-vulnerable Vitest floor', () => {
      const lockfile = readJson('package-lock.json');

      for (const packageName of ['vitest', '@vitest/coverage-v8']) {
        const lockedVersion = lockfile.packages?.[`node_modules/${packageName}`]?.version;

        expect(lockedVersion, `${packageName} missing from package-lock.json`).toBeDefined();
        expect(isAtLeast(lockedVersion, minimumVitest)).toBe(true);
      }
    });
  });

  describe('cross-module dependencies use workspace protocol', () => {
    const modulesWithFileDeps = [
      { module: 'franken-critique', dep: '@franken/types' },
      { module: 'franken-governor', dep: '@franken/types' },
      { module: 'franken-orchestrator', dep: '@franken/types' },
      { module: 'franken-planner', dep: '@franken/types' },
    ];

    for (const { module, dep } of modulesWithFileDeps) {
      it(`${module} depends on ${dep} via "*" (not file:)`, () => {
        const pkg = readPkg(`packages/${module}/package.json`);
        const version = pkg.dependencies?.[dep];
        expect(version).toBe('*');
        expect(version).not.toMatch(/^file:/);
      });
    }

    it('franken-orchestrator depends on @frankenbeast/observer via "*" (not file:)', () => {
      const pkg = readPkg('packages/franken-orchestrator/package.json');
      const version = pkg.dependencies?.['@frankenbeast/observer'];
      expect(version).toBe('*');
      expect(version).not.toMatch(/^file:/);
    });
  });

  describe('no file: dependencies remain anywhere', () => {
    const allPackages = [
      'franken-brain',
      'franken-critique',
      'franken-governor',
      'franken-observer',
      'franken-orchestrator',
      'franken-planner',
      'franken-types',
    ];

    for (const module of allPackages) {
      it(`packages/${module}/package.json has no file: dependencies`, () => {
        const pkg = readPkg(`packages/${module}/package.json`);
        const allDeps = {
          ...pkg.dependencies,
          ...pkg.devDependencies,
        };
        for (const [name, version] of Object.entries(allDeps)) {
          expect(version, `${name} in ${module} uses file: path`).not.toMatch(
            /^file:/,
          );
        }
      });
    }
  });

  describe('name fields preserved', () => {
    const expectedNames: Record<string, string> = {
      'franken-critique': '@franken/critique',
      'franken-governor': '@franken/governor',
      'franken-orchestrator': 'franken-orchestrator',
      'franken-planner': 'franken-planner',
    };

    for (const [dir, name] of Object.entries(expectedNames)) {
      it(`packages/${dir}/package.json retains name "${name}"`, () => {
        const pkg = readPkg(`packages/${dir}/package.json`);
        expect(pkg.name).toBe(name);
      });
    }
  });
});
