import { closeSync, mkdtempSync, mkdirSync, readFileSync, renameSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  openWorkspaceArtifactFile,
  readWorkspaceArtifactFile,
  workspaceArtifactFileExists,
} from '../src/workspace/artifact-path.js';

function tempRoot(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

describe('workspace artifact paths', () => {
  it('opens and reads normalized artifact files beneath the workspace', () => {
    const workspace = tempRoot('live-bench-artifacts-');
    mkdirSync(join(workspace, 'artifacts'));
    writeFileSync(join(workspace, 'artifacts', 'result.txt'), 'ok\n', 'utf8');

    expect(readWorkspaceArtifactFile(workspace, 'artifacts/result.txt').toString('utf8')).toBe('ok\n');
    expect(workspaceArtifactFileExists(workspace, 'artifacts/result.txt')).toBe(true);
    expect(workspaceArtifactFileExists(workspace, 'artifacts/missing.txt')).toBe(false);
  });

  it('rejects symlinked path components before an evaluator can inspect an artifact', () => {
    const workspace = tempRoot('live-bench-artifacts-');
    const outside = tempRoot('live-bench-artifacts-outside-');
    writeFileSync(join(outside, 'secret.txt'), 'outside\n', 'utf8');
    symlinkSync(outside, join(workspace, 'linked'), 'dir');

    expect(() => openWorkspaceArtifactFile(workspace, 'linked/secret.txt')).toThrow(/must not contain symlinks/);
  });

  it('rejects dangling symlinks instead of reporting an ordinary missing artifact', () => {
    const workspace = tempRoot('live-bench-artifacts-');
    symlinkSync(join(workspace, 'missing-target'), join(workspace, 'dangling'));

    expect(() => workspaceArtifactFileExists(workspace, 'dangling')).toThrow(/must not contain symlinks/);
  });

  it('does not disguise a missing workspace as a missing artifact', () => {
    const parent = tempRoot('live-bench-artifacts-');

    expect(() => workspaceArtifactFileExists(join(parent, 'missing-workspace'), 'result.txt')).toThrow(/ENOENT/);
  });

  it('returns false for contained outputs with the wrong filesystem shape', () => {
    const workspace = tempRoot('live-bench-artifacts-');
    writeFileSync(join(workspace, 'artifacts'), 'not a directory\n', 'utf8');
    mkdirSync(join(workspace, 'result-directory'));

    expect(workspaceArtifactFileExists(workspace, 'artifacts/result.txt')).toBe(false);
    expect(workspaceArtifactFileExists(workspace, 'result-directory')).toBe(false);
  });

  it('rejects a symlinked workspace root', () => {
    const workspace = tempRoot('live-bench-artifacts-');
    const linkParent = tempRoot('live-bench-artifacts-link-');
    const workspaceLink = join(linkParent, 'workspace');
    symlinkSync(workspace, workspaceLink, 'dir');

    expect(() => openWorkspaceArtifactFile(workspaceLink, 'result.txt')).toThrow(/workspace root must not be a symlink/);
  });

  it('rejects symlinked ancestors of the workspace root', () => {
    const realParent = tempRoot('live-bench-artifacts-real-parent-');
    const workspace = join(realParent, 'workspace');
    mkdirSync(workspace);
    const linkParent = tempRoot('live-bench-artifacts-link-parent-');
    const parentLink = join(linkParent, 'parent');
    symlinkSync(realParent, parentLink, 'dir');

    expect(() => openWorkspaceArtifactFile(join(parentLink, 'workspace'), 'result.txt')).toThrow(/workspace root path component must not be a symlink/);
  });

  it('pins the validated file so a later symlink swap cannot redirect the read', () => {
    const workspace = tempRoot('live-bench-artifacts-');
    const outside = tempRoot('live-bench-artifacts-outside-');
    mkdirSync(join(workspace, 'artifacts'));
    writeFileSync(join(workspace, 'artifacts', 'result.txt'), 'inside\n', 'utf8');
    writeFileSync(join(outside, 'result.txt'), 'outside\n', 'utf8');

    const fd = openWorkspaceArtifactFile(workspace, 'artifacts/result.txt');
    try {
      renameSync(join(workspace, 'artifacts'), join(workspace, 'original-artifacts'));
      symlinkSync(outside, join(workspace, 'artifacts'), 'dir');

      expect(readFileSync(fd, 'utf8')).toBe('inside\n');
      expect(() => readWorkspaceArtifactFile(workspace, 'artifacts/result.txt')).toThrow(/must not contain symlinks/);
    } finally {
      closeSync(fd);
    }
  });
});
