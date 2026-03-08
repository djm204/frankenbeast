import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveProjectRoot, getProjectPaths, scaffoldFrankenbeast } from '../../../src/cli/project-root.js';

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

    it('resolves relative paths to absolute', () => {
      const result = resolveProjectRoot('.');
      expect(result).toBe(resolve('.'));
    });
  });

  describe('getProjectPaths', () => {
    it('returns all conventional paths', () => {
      const paths = getProjectPaths(testDir);
      expect(paths.root).toBe(testDir);
      expect(paths.frankenbeastDir).toBe(resolve(testDir, '.frankenbeast'));
      expect(paths.plansDir).toBe(resolve(testDir, '.frankenbeast/plans'));
      expect(paths.buildDir).toBe(resolve(testDir, '.frankenbeast/.build'));
      expect(paths.checkpointFile).toBe(resolve(testDir, '.frankenbeast/.build/.checkpoint'));
      expect(paths.tracesDb).toBe(resolve(testDir, '.frankenbeast/.build/build-traces.db'));
      expect(paths.logFile).toBe(resolve(testDir, '.frankenbeast/.build/build.log'));
      expect(paths.designDocFile).toBe(resolve(testDir, '.frankenbeast/plans/design.md'));
      expect(paths.configFile).toBe(resolve(testDir, '.frankenbeast/config.json'));
    });
  });

  describe('scaffoldFrankenbeast', () => {
    it('creates .frankenbeast directory structure', () => {
      const paths = getProjectPaths(testDir);
      scaffoldFrankenbeast(paths);
      expect(existsSync(paths.plansDir)).toBe(true);
      expect(existsSync(paths.buildDir)).toBe(true);
    });

    it('is idempotent', () => {
      const paths = getProjectPaths(testDir);
      scaffoldFrankenbeast(paths);
      scaffoldFrankenbeast(paths);
      expect(existsSync(paths.plansDir)).toBe(true);
    });
  });
});
