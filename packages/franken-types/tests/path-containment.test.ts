import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  resolveArchiveEntryPath,
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

  it('allows contained path names whose first segment starts with dot-dot', () => {
    withTempRoot('contained-dot-dot-prefix', root => {
      const nested = join(root, '..design');
      const designDoc = join(nested, 'design.md');
      mkdirSync(nested, { recursive: true });
      writeFileSync(designDoc, '# Design', 'utf8');

      expect(resolveContainedExistingPath(root, '..design/design.md', 'designDocPath')).toBe(
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

  it('resolves safe archive entries under the extraction root before nested parents exist', () => {
    withTempRoot('archive-entry-safe', root => {
      expect(resolveArchiveEntryPath(root, 'nested/docs/readme.md')).toBe(resolve(root, 'nested/docs/readme.md'));
      expect(resolveArchiveEntryPath(root, './/nested\\docs/./guide.md')).toBe(resolve(root, 'nested/docs/guide.md'));
    });
  });

  it('rejects archive entries that could escape through zip-slip traversal', () => {
    withTempRoot('archive-entry-zip-slip', root => {
      expect(() => resolveArchiveEntryPath(root, '../secret.txt')).toThrow(
        /archiveEntryPath is not a safe archive entry path: parent directory segment/i,
      );
      expect(() => resolveArchiveEntryPath(root, 'nested/../../secret.txt')).toThrow(
        /archiveEntryPath is not a safe archive entry path: parent directory segment/i,
      );
    });
  });

  it('rejects absolute, Windows drive, UNC, empty, and NUL archive entries by default', () => {
    withTempRoot('archive-entry-denylist', root => {
      expect(() => resolveArchiveEntryPath(root, '/tmp/evil.txt')).toThrow(/absolute path/i);
      expect(() => resolveArchiveEntryPath(root, 'C:\\tmp\\evil.txt')).toThrow(/absolute path/i);
      expect(() => resolveArchiveEntryPath(root, '\\\\server\\share\\evil.txt')).toThrow(/absolute path/i);
      expect(() => resolveArchiveEntryPath(root, '')).toThrow(/empty path/i);
      expect(() => resolveArchiveEntryPath(root, '\0evil.txt')).toThrow(/NUL byte/i);
    });
  });

  it('keeps explicit unsafe archive-entry overrides contained inside the extraction root', () => {
    withTempRoot('archive-entry-unsafe-override', root => {
      expect(resolveArchiveEntryPath(root, 'trusted/../kept.txt', 'archiveEntryPath', {
        allowUnsafeArchiveEntryPaths: true,
      })).toBe(resolve(root, 'kept.txt'));
      expect(() => resolveArchiveEntryPath(root, '../outside.txt', 'archiveEntryPath', {
        allowUnsafeArchiveEntryPaths: true,
      })).toThrow(/archiveEntryPath resolves outside base directory/i);
    });
  });
});
