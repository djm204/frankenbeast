import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const exec = (cmd: string) =>
  execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim();

const ALL_PACKAGES = [
  'franken-brain',
  'franken-critique',
  'franken-governor',
  'franken-observer',
  'franken-orchestrator',
  'franken-planner',
  'franken-types',
  'franken-web',
] as const;

describe('Chunk 10: full verification pass', () => {
  describe('build', () => {
    it('turbo run build succeeds for all 8 packages', () => {
      const output = exec('npx turbo run build 2>&1');
      expect(output).toContain('8 successful, 8 total');
    });
  });

  describe('tests', () => {
    it('turbo run test succeeds for all packages', () => {
      const output = exec('npx turbo run test 2>&1');
      expect(output).toContain('successful');
      // Check the turbo Tasks summary line, not the entire output
      // (test names may contain the word "failed" in passing tests)
      const tasksLine = output.split('\n').find((l) => l.includes('Tasks:'));
      expect(tasksLine).toBeDefined();
      expect(tasksLine).not.toContain('failed');
    });

    it('total test count is at least 1572', () => {
      const output = exec('npx turbo run test 2>&1');
      const testLines = output.match(/(\d+) passed/g) ?? [];
      const total = testLines.reduce((sum, line) => {
        const match = line.match(/(\d+) passed/);
        return sum + (match ? parseInt(match[1], 10) : 0);
      }, 0);
      expect(total).toBeGreaterThanOrEqual(1572);
    });
  });

  describe('workspace resolution', () => {
    it('npm ls @franken/types resolves without errors', () => {
      // npm ls exits non-zero on errors, so a successful exec means no errors
      const output = exec('npm ls @franken/types 2>&1');
      expect(output).not.toContain('ERR!');
      expect(output).not.toContain('WARN');
      expect(output).toContain('@franken/types');
    });
  });

  describe('git history preservation', () => {
    it('packages/franken-types/ has 3+ commits in history', () => {
      const count = parseInt(
        exec('git log --oneline packages/franken-types/ | wc -l'),
        10,
      );
      expect(count).toBeGreaterThanOrEqual(3);
    });

    it('packages/franken-orchestrator/ has 108+ commits in history', () => {
      const count = parseInt(
        exec('git log --oneline packages/franken-orchestrator/ | wc -l'),
        10,
      );
      expect(count).toBeGreaterThanOrEqual(108);
    });

    it('packages/franken-brain/ has commits in history', () => {
      const count = parseInt(
        exec('git log --oneline packages/franken-brain/ | wc -l'),
        10,
      );
      expect(count).toBeGreaterThanOrEqual(1);
    });

    it('git blame shows commit hashes for planner source', () => {
      const blame = exec(
        'git blame packages/franken-planner/src/core/dag.ts | head -5',
      );
      const hashes = blame
        .split('\n')
        .map((line) => line.split(' ')[0])
        .filter(Boolean);
      // At least one valid hash should exist
      expect(hashes.length).toBeGreaterThan(0);
    });
  });

  describe('no gitlinks in index', () => {
    it('git ls-tree HEAD contains no mode-160000 entries', () => {
      const output = exec('git ls-tree HEAD');
      const gitlinks = output.split('\n').filter((l) => l.includes('160000'));
      expect(gitlinks).toHaveLength(0);
    });
  });

  describe('no root-level module directories', () => {
    for (const dir of ALL_PACKAGES) {
      it(`${dir}/ should not exist at root level`, () => {
        expect(existsSync(resolve(ROOT, dir))).toBe(false);
      });
    }
  });

  describe('no .git dirs inside packages', () => {
    for (const dir of ALL_PACKAGES) {
      it(`packages/${dir}/.git should not exist`, () => {
        expect(existsSync(resolve(ROOT, 'packages', dir, '.git'))).toBe(false);
      });
    }
  });
});
