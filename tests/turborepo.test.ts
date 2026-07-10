import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const readJson = (rel: string) =>
  JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
const readPackageScripts = () =>
  readdirSync(join(ROOT, 'packages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const manifestPath = join('packages', entry.name, 'package.json');
      if (!existsSync(join(ROOT, manifestPath))) {
        return [];
      }
      const manifest = readJson(manifestPath);
      return [manifest.scripts ?? {}];
    });

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

    it('does not define a stale test:ci Turbo task', () => {
      const turbo = readJson('turbo.json');
      expect(turbo.tasks?.['test:ci']).toBeUndefined();
    });

    it('keeps every Turbo task discoverable from root or package scripts', () => {
      const turbo = readJson('turbo.json');
      const rootPkg = readJson('package.json');
      const packageScripts = readPackageScripts();

      for (const taskName of Object.keys(turbo.tasks ?? {})) {
        const hasRootScript = rootPkg.scripts?.[taskName] != null;
        const hasPackageScript = packageScripts.some(
          (scripts) => scripts[taskName] != null,
        );
        const hasRootScriptDelegatingToTask = Object.values(
          rootPkg.scripts ?? {},
        ).some(
          (script) =>
            typeof script === 'string' &&
            script.includes(`turbo run ${taskName}`),
        );

        expect(
          hasRootScript || hasPackageScript || hasRootScriptDelegatingToTask,
        ).toBe(true);
      }
    });

    it('defines an explicit live-bench live test task', () => {
      const turbo = readJson('turbo.json');
      const liveBenchTask = turbo.tasks?.['test:live'];
      expect(liveBenchTask).toBeDefined();
      expect(liveBenchTask.cache).toBe(false);
      expect(liveBenchTask.dependsOn).toContain('build');
      expect(liveBenchTask.env).toContain('FBEAST_LIVE_BENCH_E2E');
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

    it('test:ci script runs the same root-plus-package test target as CI', () => {
      expect(rootPkg.scripts['test:ci']).toBe(
        'npm run build --workspace @franken/types && npm run ci:test:root && npm run ci:test:packages',
      );

      const ciWorkflow = readFileSync(
        join(ROOT, '.github/workflows/ci.yml'),
        'utf8',
      );
      expect(ciWorkflow).toContain('run: npm run test:ci');
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

    it('exposes orchestrator E2E tests through a root script', () => {
      const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');

      expect(rootPkg.scripts['test:e2e']).toBe('npm run test:e2e --workspace @franken/orchestrator --');
      expect(readme).toContain('npm run test:e2e');
      expect(readme).toContain('E2E=true');
      expect(readme).toContain('npm run build');
      expect(readme).not.toContain('npm run build --workspace @franken/orchestrator');
      expect(readme).toContain('real `claude` CLI on');
      expect(readme).toContain('provide a valid');
      expect(readme).toContain('`ANTHROPIC_API_KEY` in the environment');
    });

    it('keeps test:root:watch as vitest for dev', () => {
      expect(rootPkg.scripts['test:root:watch']).toBe('vitest');
    });

    it('exposes the live-bench live suite through an explicit root script', () => {
      expect(rootPkg.scripts['test:live:bench']).toBe('turbo run test:live --filter=@franken/live-bench');
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
