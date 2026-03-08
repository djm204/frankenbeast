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
  'franken-heartbeat',
  'franken-mcp',
  'franken-observer',
  'franken-orchestrator',
  'franken-planner',
  'franken-skills',
  'franken-types',
  'frankenfirewall',
] as const;

describe('Chunk 10: full verification pass', () => {
  describe('build', () => {
    it('turbo run build succeeds for all 11 packages', () => {
      const output = exec('npx turbo run build 2>&1');
      expect(output).toContain('11 successful, 11 total');
    });
  });

  describe('tests', () => {
    it('turbo run test succeeds for all packages', () => {
      const output = exec('npx turbo run test 2>&1');
      expect(output).toContain('successful');
      expect(output).not.toContain('failed');
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

    it('packages/franken-brain/ has 39+ commits in history', () => {
      const count = parseInt(
        exec('git log --oneline packages/franken-brain/ | wc -l'),
        10,
      );
      expect(count).toBeGreaterThanOrEqual(39);
    });

    it('git blame shows original commit hashes, not merge commits', () => {
      const blame = exec(
        'git blame packages/franken-planner/src/core/dag.ts | head -5',
      );
      const hashes = blame
        .split('\n')
        .map((line) => line.split(' ')[0])
        .filter(Boolean);
      const uniqueHashes = new Set(hashes);
      // If all lines have the same hash, it was a bulk copy, not preserved history
      expect(uniqueHashes.size).toBeGreaterThan(1);
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
