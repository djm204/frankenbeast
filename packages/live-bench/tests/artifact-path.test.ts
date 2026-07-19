import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveWorkspaceArtifactPath } from '../src/workspace/artifact-path.js';

function tempRoot(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

describe('workspace artifact paths', () => {
  it('resolves normalized paths beneath the workspace, including missing artifacts', () => {
    const workspace = tempRoot('live-bench-artifacts-');
    mkdirSync(join(workspace, 'artifacts'));
    writeFileSync(join(workspace, 'artifacts', 'result.txt'), 'ok\n', 'utf8');

    expect(resolveWorkspaceArtifactPath(workspace, 'artifacts/result.txt')).toBe(join(workspace, 'artifacts', 'result.txt'));
    expect(resolveWorkspaceArtifactPath(workspace, 'artifacts/missing.txt')).toBe(join(workspace, 'artifacts', 'missing.txt'));
  });

  it('rejects symlinked path components before an evaluator can inspect an artifact', () => {
    const workspace = tempRoot('live-bench-artifacts-');
    const outside = tempRoot('live-bench-artifacts-outside-');
    writeFileSync(join(outside, 'secret.txt'), 'outside\n', 'utf8');
    symlinkSync(outside, join(workspace, 'linked'), 'dir');

    expect(() => resolveWorkspaceArtifactPath(workspace, 'linked/secret.txt')).toThrow(/must not contain symlinks/);
  });

  it('rejects a symlinked workspace root', () => {
    const workspace = tempRoot('live-bench-artifacts-');
    const linkParent = tempRoot('live-bench-artifacts-link-');
    const workspaceLink = join(linkParent, 'workspace');
    symlinkSync(workspace, workspaceLink, 'dir');

    expect(() => resolveWorkspaceArtifactPath(workspaceLink, 'result.txt')).toThrow(/workspace root must not be a symlink/);
  });

  it('rejects symlinked ancestors of the workspace root', () => {
    const realParent = tempRoot('live-bench-artifacts-real-parent-');
    const workspace = join(realParent, 'workspace');
    mkdirSync(workspace);
    const linkParent = tempRoot('live-bench-artifacts-link-parent-');
    const parentLink = join(linkParent, 'parent');
    symlinkSync(realParent, parentLink, 'dir');

    expect(() => resolveWorkspaceArtifactPath(join(parentLink, 'workspace'), 'result.txt')).toThrow(/workspace root path component must not be a symlink/);
  });
});
