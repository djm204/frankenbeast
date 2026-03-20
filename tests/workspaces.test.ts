import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const readPkg = (rel: string) =>
  JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));

describe('npm workspaces configuration', () => {
  describe('root package.json', () => {
    const rootPkg = readPkg('package.json');

    it('has workspaces field set to packages/*', () => {
      expect(rootPkg.workspaces).toEqual(['packages/*']);
    });

    it('remains private (required for workspaces)', () => {
      expect(rootPkg.private).toBe(true);
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
