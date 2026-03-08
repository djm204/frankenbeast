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

    it('defines test task with build dependency', () => {
      const turbo = readJson('turbo.json');
      const testTask = turbo.tasks?.test;
      expect(testTask).toBeDefined();
      expect(testTask.dependsOn).toContain('build');
    });

    it('defines test:ci task', () => {
      const turbo = readJson('turbo.json');
      expect(turbo.tasks?.['test:ci']).toBeDefined();
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
  });

  describe('turbo devDependency', () => {
    const rootPkg = readJson('package.json');

    it('turbo is in root devDependencies', () => {
      expect(rootPkg.devDependencies.turbo).toBeDefined();
    });
  });

  describe('.gitignore includes .turbo', () => {
    it('has .turbo entry', () => {
      const gitignore = readFileSync(join(ROOT, '.gitignore'), 'utf8');
      expect(gitignore).toMatch(/^\.turbo$/m);
    });
  });

  describe('all modules use vitest run (not bare vitest) for test script', () => {
    const allPackages = [
      'franken-brain',
      'franken-critique',
      'franken-governor',
      'franken-heartbeat',
      'franken-mcp',
      'franken-observer',
      'franken-orchestrator',
      'franken-planner',
      'franken-skills',
      'franken-types',
      'frankenfirewall',
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
