import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  resolveContainedExistingPath,
  resolveContainedPath,
} from '../src/path-containment.js';

function withTempRoot<T>(prefix: string, fn: (root: string) => T): T {
  const root = mkdtempSync(join(tmpdir(), `${prefix}-${randomUUID()}-`));
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('realpath containment helpers', () => {
  it('resolves existing relative paths inside the real base directory', () => {
    withTempRoot('contained-existing', root => {
      const nested = join(root, 'docs');
      const designDoc = join(nested, 'design.md');
      mkdirSync(nested, { recursive: true });
      writeFileSync(designDoc, '# Design', 'utf8');

      expect(resolveContainedExistingPath(root, 'docs/design.md', 'designDocPath')).toBe(realpathSync(designDoc));
    });
  });

  it('can resolve relative paths from an explicit cwd before containment', () => {
    withTempRoot('contained-explicit-relative-base', root => {
      const nested = join(root, 'docs');
      const designDoc = join(nested, 'design.md');
      mkdirSync(nested, { recursive: true });
      writeFileSync(designDoc, '# Design', 'utf8');

      expect(resolveContainedExistingPath(root, 'design.md', 'designDocPath', { relativeTo: nested })).toBe(
        realpathSync(designDoc),
      );
    });
  });

  it('rejects existing paths that escape the base through a symlink', () => {
    withTempRoot('contained-symlink', root => {
      const outside = join(root, '..', `outside-${randomUUID()}`);
      const outsideFile = join(outside, 'secret.md');
      const link = join(root, 'linked-outside');
      mkdirSync(outside, { recursive: true });
      writeFileSync(outsideFile, 'secret', 'utf8');
      symlinkSync(outside, link, 'dir');

      try {
        expect(() => resolveContainedExistingPath(root, 'linked-outside/secret.md', 'designDocPath')).toThrow(
          /designDocPath resolves outside base directory/i,
        );
      } finally {
        rmSync(outside, { recursive: true, force: true });
      }
    });
  });

  it('resolves new leaf paths via a real parent and rejects parent symlink escapes', () => {
    withTempRoot('contained-new-leaf', root => {
      const outside = join(root, '..', `outside-${randomUUID()}`);
      const link = join(root, 'reports-link');
      mkdirSync(outside, { recursive: true });
      symlinkSync(outside, link, 'dir');

      try {
        expect(() => resolveContainedPath(root, 'reports-link/report.md', 'outputPath')).toThrow(
          /outputPath resolves outside base directory/i,
        );

        mkdirSync(join(root, 'reports'), { recursive: true });
        expect(resolveContainedPath(root, 'reports/report.md', 'outputPath')).toBe(resolve(root, 'reports/report.md'));
      } finally {
        rmSync(outside, { recursive: true, force: true });
      }
    });
  });
});
