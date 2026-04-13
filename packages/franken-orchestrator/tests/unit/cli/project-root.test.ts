import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveProjectRoot, getProjectPaths, generatePlanName, scaffoldFrankenbeast } from '../../../src/cli/project-root.js';

describe('project-root', () => {
  const testDir = resolve(tmpdir(), 'fb-test-project-root');

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('resolveProjectRoot', () => {
    it('resolves an existing directory', () => {
      expect(resolveProjectRoot(testDir)).toBe(testDir);
    });

    it('throws for non-existent directory', () => {
      expect(() => resolveProjectRoot('/nonexistent/path')).toThrow('Project root does not exist');
    });

    it('resolves relative paths to the workspace root when called from a package cwd', () => {
      const result = resolveProjectRoot('.');
      expect(result).toBe(resolve('../../'));
    });

    it('walks up from a workspace package directory to the repo root', () => {
      const repoRoot = resolve(testDir, 'repo');
      const packageDir = resolve(repoRoot, 'packages/franken-orchestrator');
      mkdirSync(packageDir, { recursive: true });
      writeFileSync(
        resolve(repoRoot, 'package.json'),
        JSON.stringify({ private: true, workspaces: ['packages/*'] }),
      );

      expect(resolveProjectRoot(packageDir)).toBe(repoRoot);
    });
  });

  describe('getProjectPaths', () => {
    it('returns flat plans dir when no plan name provided', () => {
      const paths = getProjectPaths(testDir);
      expect(paths.root).toBe(testDir);
      expect(paths.frankenbeastDir).toBe(resolve(testDir, '.fbeast'));
      expect(paths.llmCacheDir).toBe(resolve(testDir, '.fbeast/.cache/llm'));
      expect(paths.plansDir).toBe(resolve(testDir, '.fbeast/plans'));
      expect(paths.buildDir).toBe(resolve(testDir, '.fbeast/.build'));
      expect(paths.beastsDir).toBe(resolve(testDir, '.fbeast/.build/beasts'));
      expect(paths.beastLogsDir).toBe(resolve(testDir, '.fbeast/.build/beasts/logs'));
      expect(paths.beastsDb).toBe(resolve(testDir, '.fbeast/.build/beasts.db'));
      expect(paths.designDocFile).toBe(resolve(testDir, '.fbeast/plans/design.md'));
      expect(paths.llmResponseFile).toBe(resolve(testDir, '.fbeast/plans/llm-response.json'));
      expect(paths.configFile).toBe(resolve(testDir, '.fbeast/config.json'));
    });

    it('scopes plans dir by plan name when provided', () => {
      const paths = getProjectPaths(testDir, 'monorepo-migration');
      expect(paths.plansDir).toBe(resolve(testDir, '.fbeast/plans/monorepo-migration'));
      expect(paths.designDocFile).toBe(resolve(testDir, '.fbeast/plans/monorepo-migration/design.md'));
      expect(paths.llmResponseFile).toBe(resolve(testDir, '.fbeast/plans/monorepo-migration/llm-response.json'));
      // build dir is shared, not plan-scoped
      expect(paths.buildDir).toBe(resolve(testDir, '.fbeast/.build'));
    });
  });

  describe('generatePlanName', () => {
    it('derives name from design doc filename', () => {
      expect(generatePlanName('docs/plans/2026-03-08-monorepo-migration-design.md'))
        .toBe('monorepo-migration-design');
    });

    it('strips date prefix from filename', () => {
      expect(generatePlanName('2026-03-08-chatbot-plan.md'))
        .toBe('chatbot-plan');
    });

    it('handles filename without date prefix', () => {
      expect(generatePlanName('my-feature.md'))
        .toBe('my-feature');
    });

    it('falls back to date-based name when no path provided', () => {
      const name = generatePlanName();
      expect(name).toMatch(/^plan-\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('scaffoldFrankenbeast', () => {
    it('creates .fbeast directory structure', () => {
      const paths = getProjectPaths(testDir);
      scaffoldFrankenbeast(paths);
      expect(existsSync(paths.plansDir)).toBe(true);
      expect(existsSync(paths.buildDir)).toBe(true);
      expect(existsSync(paths.beastsDir)).toBe(true);
      expect(existsSync(paths.beastLogsDir)).toBe(true);
    });

    it('is idempotent', () => {
      const paths = getProjectPaths(testDir);
      scaffoldFrankenbeast(paths);
      scaffoldFrankenbeast(paths);
      expect(existsSync(paths.plansDir)).toBe(true);
    });
  });
});
