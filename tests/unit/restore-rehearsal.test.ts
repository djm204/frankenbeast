import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it, afterEach } from 'vitest';

import { runRestoreRehearsal } from '../../scripts/restore-rehearsal.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
const SCRIPT = resolve(ROOT, 'scripts/restore-rehearsal.mjs');

let keepRoot: string | undefined;

afterEach(async () => {
  if (keepRoot) {
    await rm(keepRoot, { recursive: true, force: true });
    keepRoot = undefined;
  }
});

describe('restore rehearsal fixture', () => {
  it('backs up and restores isolated Kanban, approval, and liveness fixture state', async () => {
    const result = await runRestoreRehearsal();

    expect(result.ok).toBe(true);
    expect(result.restored.task).toMatchObject({
      id: 'fixture-task-restore-rehearsal',
      title: 'fixture restore rehearsal task',
      status: 'blocked',
      assignee: 'fixture-worker',
    });
    expect(result.restored.comments).toBe(1);
    expect(result.restored.approvalId).toBe('approval-fixture-001');
    expect(result.restored.workerIds).toContain('worker-fixture-001');
    expect(result.corruptFixture.ok).toBe(true);
    expect(result.corruptFixture.error).toMatch(/approval ledger is not valid JSON/u);
    expect(existsSync(result.root)).toBe(false);
  });

  it('keeps the rehearsal under a caller-provided scratch root when requested', async () => {
    keepRoot = await mkdtemp(join(tmpdir(), 'restore-rehearsal-test-'));
    const result = await runRestoreRehearsal({ root: keepRoot, cleanup: false, includeCorruptCase: false });

    expect(result.ok).toBe(true);
    expect(result.root).toBe(resolve(keepRoot));
    expect(existsSync(resolve(keepRoot, 'fixture-source', 'profiles', 'default', 'kanban.db'))).toBe(true);
    expect(existsSync(resolve(keepRoot, 'backups', 'fixture-source.franken-dr.json'))).toBe(true);
    expect(existsSync(resolve(
      keepRoot,
      'restore-target',
      '_quarantine',
      'approvals',
      'profiles',
      'default',
      'approvals',
      'ledger.json',
    ))).toBe(true);
    expect(result.corruptFixture.ok).toBe('skipped');
  });

  it('prints deterministic CLI evidence and the corrupt-fixture failure reason', () => {
    const result = spawnSync('npx', ['tsx', SCRIPT], {
      cwd: ROOT,
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('[restore-rehearsal] ok - encrypted fixture backup restored into isolated temp root');
    expect(result.stdout).toContain('task=fixture-task-restore-rehearsal');
    expect(result.stdout).toContain('approval=approval-fixture-001');
    expect(result.stdout).toContain('workers=worker-fixture-001');
    expect(result.stdout).toContain('corrupt-fixture ok - approval ledger is not valid JSON');
  });

  it('refuses to use repository paths as the rehearsal root', () => {
    for (const unsafeRoot of [ROOT, resolve(ROOT, 'scripts')]) {
      const result = spawnSync('npx', ['tsx', SCRIPT, '--root', unsafeRoot], {
        cwd: tmpdir(),
        encoding: 'utf8',
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('must be an isolated scratch directory');
    }
  });

  it('refuses symlinked repository descendants as rehearsal roots', async () => {
    const linkParent = await mkdtemp(join(tmpdir(), 'restore-rehearsal-link-'));
    keepRoot = linkParent;
    const repoLink = join(linkParent, 'repo-link');
    await symlink(ROOT, repoLink, 'dir');

    const result = spawnSync('npx', ['tsx', SCRIPT, '--root', join(repoLink, 'scripts')], {
      cwd: tmpdir(),
      encoding: 'utf8',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('must be an isolated scratch directory');
    expect(existsSync(resolve(ROOT, 'scripts', 'restore-rehearsal.mjs'))).toBe(true);
  });
});
