import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createEncryptedStateBackup,
  restoreEncryptedStateBackup,
  verifyEncryptedStateBackup,
} from '../../../src/dr/state-backup.js';

async function makeFixtureState(): Promise<{ dir: string; keyFile: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'franken-state-backup-'));
  const stateDir = join(dir, 'state');
  await mkdir(join(stateDir, 'approvals'), { recursive: true });
  await mkdir(join(stateDir, 'liveness'), { recursive: true });
  await mkdir(join(stateDir, 'runs', 'run-1'), { recursive: true });
  await writeFile(join(stateDir, 'kanban.db'), 'sqlite-kanban-bytes', 'utf8');
  await writeFile(join(stateDir, 'approvals', 'ledger.json'), JSON.stringify({ token: 'secret-approval-token' }), 'utf8');
  await writeFile(join(stateDir, 'liveness', 'worker.json'), JSON.stringify({ heartbeat: 'ok' }), 'utf8');
  await writeFile(join(stateDir, 'runs', 'run-1', 'metadata.json'), JSON.stringify({ taskId: 'task-1' }), 'utf8');
  await writeFile(join(stateDir, 'profile-memory.json'), JSON.stringify({ user: 'private memory' }), 'utf8');
  const keyFile = join(dir, 'backup.key');
  await writeFile(keyFile, 'test key material', 'utf8');
  return { dir, keyFile };
}

describe('encrypted DR state backups', () => {
  it('creates an encrypted backup with Kanban and agent-state manifest categories', async () => {
    const { dir, keyFile } = await makeFixtureState();
    const backupPath = join(dir, 'backup.franken-dr.json');

    try {
      const envelope = await createEncryptedStateBackup({
        stateDir: join(dir, 'state'),
        outputPath: backupPath,
        keyFilePath: keyFile,
        generatedAt: '2026-07-15T10:00:00.000Z',
      });
      const raw = await readFile(backupPath, 'utf8');

      expect(envelope.encryption).toEqual(expect.objectContaining({ encrypted: true, algorithm: 'aes-256-gcm' }));
      expect(envelope.manifest.categories).toEqual(expect.objectContaining({
        kanban: 1,
        approvals: 1,
        liveness: 1,
        runs: 1,
      }));
      expect(envelope.manifest.files.map((file) => file.path)).toEqual([
        'approvals/ledger.json',
        'kanban.db',
        'liveness/worker.json',
        'profile-memory.json',
        'runs/run-1/metadata.json',
      ]);
      expect(raw).not.toContain('secret-approval-token');
      expect(raw).not.toContain('private memory');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('verifies encrypted backups and rejects tampered ciphertext', async () => {
    const { dir, keyFile } = await makeFixtureState();
    const backupPath = join(dir, 'backup.franken-dr.json');
    const tamperedPath = join(dir, 'tampered.franken-dr.json');

    try {
      await createEncryptedStateBackup({ stateDir: join(dir, 'state'), outputPath: backupPath, keyFilePath: keyFile });
      const report = await verifyEncryptedStateBackup(backupPath, keyFile);
      expect(report.verifiedFiles).toBe(5);
      expect(report.manifest.categories.approvals).toBe(1);

      const parsed = JSON.parse(await readFile(backupPath, 'utf8')) as { ciphertext: string };
      parsed.ciphertext = `${parsed.ciphertext.slice(0, -4)}AAAA`;
      await writeFile(tamperedPath, JSON.stringify(parsed), 'utf8');
      await expect(verifyEncryptedStateBackup(tamperedPath, keyFile)).rejects.toThrow(/digest mismatch|Unable to decrypt/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('supports restore dry-run and exact restore without writing in dry-run mode', async () => {
    const { dir, keyFile } = await makeFixtureState();
    const backupPath = join(dir, 'backup.franken-dr.json');
    const restoreDir = join(dir, 'restore');

    try {
      await createEncryptedStateBackup({ stateDir: join(dir, 'state'), outputPath: backupPath, keyFilePath: keyFile });
      const dryRun = await restoreEncryptedStateBackup({ backupPath, targetDir: restoreDir, keyFilePath: keyFile, dryRun: true });
      expect(dryRun.wouldWrite).toBe(false);
      await expect(stat(join(restoreDir, 'kanban.db'))).rejects.toThrow();

      const restored = await restoreEncryptedStateBackup({ backupPath, targetDir: restoreDir, keyFilePath: keyFile });
      expect(restored.wouldWrite).toBe(true);
      await expect(readFile(join(restoreDir, 'kanban.db'), 'utf8')).resolves.toBe('sqlite-kanban-bytes');
      await expect(readFile(join(restoreDir, 'approvals', 'ledger.json'), 'utf8')).resolves.toContain('secret-approval-token');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
