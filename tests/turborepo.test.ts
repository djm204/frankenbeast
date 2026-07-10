import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const readJson = (rel: string) =>
  JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));

describe('Turborepo configuration', () => {
  describe('turbo.json', () => {
    it('exists at project root', () => {
      expect(existsSync(join(ROOT, 'turbo.json'))).toBe(true);
    });

    it('defines build task with ^build dependency and dist outputs', () => {
      const turbo = readJson('turbo.json');
      const buildTask = turbo.tasks?.build;
      expect(buildTask).toBeDefined();
      expect(buildTask.dependsOn).toContain('^build');
      expect(buildTask.outputs).toContain('dist/**');
    });

    it('defines test task without a build dependency for source-alias watch mode', () => {
      const turbo = readJson('turbo.json');
      const testTask = turbo.tasks?.test;
      expect(testTask).toBeDefined();
      expect(testTask.dependsOn).toBeUndefined();
    });

    it('hashes cross-package Vitest source aliases and root setup scripts for cached test tasks', () => {
      const turbo = readJson('turbo.json');
      const testTask = turbo.tasks?.test;
      expect(testTask).toBeDefined();
      expect(testTask.inputs).toEqual(
        expect.arrayContaining([
          '$TURBO_DEFAULT$',
          '$TURBO_ROOT$/scripts/vitest-*.ts',
          '$TURBO_ROOT$/packages/*/src/**',
        ]),
      );
    });

    it('hashes suite-selection environment variables for cached test tasks', () => {
      const turbo = readJson('turbo.json');
      const testTask = turbo.tasks?.test;
      expect(testTask).toBeDefined();
      expect(testTask.env).toEqual(
        expect.arrayContaining(['INTEGRATION', 'E2E', 'EVAL', 'DOCKER_BUILD']),
      );
    });

    it('defines test:ci task with package build dependency for CI ordering', () => {
      const turbo = readJson('turbo.json');
      const testCiTask = turbo.tasks?.['test:ci'];
      expect(testCiTask).toBeDefined();
      expect(testCiTask.dependsOn).toContain('build');
    });

    it('defines an explicit live-bench live test task', () => {
      const turbo = readJson('turbo.json');
      const liveBenchTask = turbo.tasks?.['test:live'];
      expect(liveBenchTask).toBeDefined();
      expect(liveBenchTask.cache).toBe(false);
      expect(liveBenchTask.dependsOn).toContain('build');
      expect(liveBenchTask.env).toContain('FBEAST_LIVE_BENCH_E2E');
    });

    it('defines a deterministic integration test task across packages', () => {
      const turbo = readJson('turbo.json');
      const integrationTask = turbo.tasks?.['test:integration'];
      expect(integrationTask).toBeDefined();
      expect(integrationTask.env).toContain('INTEGRATION');
    });

    it('defines an uncached opt-in eval test task across packages', () => {
      const turbo = readJson('turbo.json');
      const evalTask = turbo.tasks?.['test:eval'];
      expect(evalTask).toBeDefined();
      expect(evalTask.cache).toBe(false);
      expect(evalTask.env).toContain('EVAL');
    });

    it('defines typecheck task', () => {
      const turbo = readJson('turbo.json');
      expect(turbo.tasks?.typecheck).toBeDefined();
    });

    it('defines lint task with no dependencies (runs in parallel)', () => {
      const turbo = readJson('turbo.json');
      const lintTask = turbo.tasks?.lint;
      expect(lintTask).toBeDefined();
      expect(lintTask.dependsOn).toBeUndefined();
    });
  });

  describe('franken-web package turbo.json', () => {
    it('hashes the root manifest for cached web builds and tests that read the root version', () => {
      const turbo = readJson('packages/franken-web/turbo.json');
      expect(turbo.extends).toEqual(['//']);

      const buildTask = turbo.tasks?.build;
      expect(buildTask).toBeDefined();
      expect(buildTask.inputs).toEqual(
        expect.arrayContaining([
          '$TURBO_DEFAULT$',
          '$TURBO_ROOT$/package.json',
        ]),
      );

      const testTask = turbo.tasks?.test;
      expect(testTask).toBeDefined();
      expect(testTask.inputs).toEqual(
        expect.arrayContaining([
          '$TURBO_DEFAULT$',
          '$TURBO_ROOT$/package.json',
          '$TURBO_ROOT$/scripts/vitest-*.ts',
          '$TURBO_ROOT$/packages/*/src/**',
        ]),
      );
    });
  });

  describe('root package.json scripts', () => {
    const rootPkg = readJson('package.json');

    it('build script uses turbo run build', () => {
      expect(rootPkg.scripts.build).toBe('turbo run build');
    });

    it('test script uses turbo run test', () => {
      expect(rootPkg.scripts.test).toBe('turbo run test');
    });

    it('typecheck script uses turbo run typecheck', () => {
      expect(rootPkg.scripts.typecheck).toBe('turbo run typecheck');
    });

    it('does not have test:all (redundant with turbo)', () => {
      expect(rootPkg.scripts['test:all']).toBeUndefined();
    });

    it('keeps test:root as vitest run for root-level integration tests', () => {
      expect(rootPkg.scripts['test:root']).toBe('vitest run');
    });

    it('keeps test:root:watch as vitest for dev', () => {
      expect(rootPkg.scripts['test:root:watch']).toBe('vitest');
    });

    it('exposes the live-bench live suite through an explicit root script', () => {
      expect(rootPkg.scripts['test:live:bench']).toBe('turbo run test:live --filter=@franken/live-bench');
    });

    it('exposes deterministic integration suites through an explicit root script', () => {
      const integrationScript = rootPkg.scripts['test:integration'];
      expect(integrationScript).toContain('turbo run test:integration');
      expect(integrationScript.split(' ')).toEqual(
        expect.arrayContaining([
          '--filter=@franken/brain',
          '--filter=@franken/critique',
          '--filter=@franken/governor',
          '--filter=@franken/observer',
          '--filter=@franken/orchestrator',
        ]),
      );
    });

    it('exposes eval suites through an explicit opt-in root script', () => {
      expect(rootPkg.scripts['test:eval']).toBe('turbo run test:eval --filter=@franken/observer');
    });
  });

  describe('turbo devDependency', () => {
    const rootPkg = readJson('package.json');

    it('turbo is in root devDependencies', () => {
      expect(rootPkg.devDependencies.turbo).toBeDefined();
    });
  });

  describe('.gitignore includes generated workspace artifacts', () => {
    it('has .turbo entry', () => {
      const gitignore = readFileSync(join(ROOT, '.gitignore'), 'utf8');
      expect(gitignore).toMatch(/^\.turbo$/m);
    });

    it('ignores the root .tmp directory used by package test scripts', () => {
      const gitignore = readFileSync(join(ROOT, '.gitignore'), 'utf8');
      expect(gitignore).toMatch(/^\.tmp\/$/m);
    });
  });

  describe('all modules use vitest run (not bare vitest) for test script', () => {
    const allPackages = [
      'franken-brain',
      'franken-critique',
      'franken-governor',
      'franken-observer',
      'franken-orchestrator',
      'franken-planner',
      'franken-types',
      'franken-web',
    ];

    for (const module of allPackages) {
      it(`packages/${module} test script uses "vitest run"`, () => {
        const pkg = readJson(`packages/${module}/package.json`);
        const testScript = pkg.scripts?.test;
        expect(testScript).toBeDefined();
        expect(testScript).toMatch(/vitest run/);
      });
    }
  });
});
