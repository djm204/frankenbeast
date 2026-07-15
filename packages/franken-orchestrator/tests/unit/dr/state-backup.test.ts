import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
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
      expect(dryRun.restoredFiles.some((file) => file.path === '_quarantine/approvals/approvals/ledger.json')).toBe(true);
      await expect(stat(join(restoreDir, 'kanban.db'))).rejects.toThrow();

      const restored = await restoreEncryptedStateBackup({ backupPath, targetDir: restoreDir, keyFilePath: keyFile });
      expect(restored.wouldWrite).toBe(true);
      await expect(readFile(join(restoreDir, 'kanban.db'), 'utf8')).resolves.toBe('sqlite-kanban-bytes');
      await expect(readFile(join(restoreDir, '_quarantine', 'approvals', 'approvals', 'ledger.json'), 'utf8')).resolves.toContain('secret-approval-token');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('excludes an in-tree output artifact, includes sibling project DB, and refuses unsafe restore targets', async () => {
    const { dir, keyFile } = await makeFixtureState();
    const inTreeBackupPath = join(dir, 'state', 'backup.franken-dr.json');
    const restoreDir = join(dir, 'restore-symlink');
    const outsideDir = join(dir, 'outside-approvals');

    try {
      await writeFile(join(dir, 'beast.db'), 'project sqlite bytes', 'utf8');
      await mkdir(join(dir, '.cache'), { recursive: true });
      await writeFile(join(dir, '.cache', 'unrelated-secret.log'), 'not state', 'utf8');
      await writeFile(join(dir, 'dr.key'), 'embedded key should be excluded', 'utf8');
      await writeFile(inTreeBackupPath, JSON.stringify({ format: 'frankenbeast-dr-state-backup', schemaVersion: 1 }), 'utf8');
      const envelope = await createEncryptedStateBackup({
        stateDir: join(dir, 'state'),
        outputPath: inTreeBackupPath,
        keyFilePath: join(dir, 'dr.key'),
      });
      const paths = envelope.manifest.files.map((file) => file.path);
      expect(paths).not.toContain('state/backup.franken-dr.json');
      expect(paths).not.toContain('dr.key');
      expect(paths).not.toContain('.cache/unrelated-secret.log');
      expect(paths).toContain('beast.db');
      expect(paths).toContain('state/kanban.db');

      await mkdir(outsideDir, { recursive: true });
      await mkdir(restoreDir, { recursive: true });
      await symlink(outsideDir, join(restoreDir, 'approvals'));
      await expect(restoreEncryptedStateBackup({
        backupPath: inTreeBackupPath,
        targetDir: restoreDir,
        keyFilePath: join(dir, 'dr.key'),
      })).rejects.toThrow(/non-empty target/);
      await expect(stat(join(outsideDir, 'ledger.json'))).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('refuses live SQLite WAL/SHM sidecars until state is quiesced', async () => {
    const { dir, keyFile } = await makeFixtureState();
    try {
      await writeFile(join(dir, 'state', 'kanban.db-journal'), 'live journal bytes', 'utf8');
      await expect(createEncryptedStateBackup({
        stateDir: join(dir, 'state'),
        outputPath: join(dir, 'backup.franken-dr.json'),
        keyFilePath: keyFile,
      })).rejects.toThrow(/quiesce SQLite state/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects output paths that alias live input or key files', async () => {
    const { dir, keyFile } = await makeFixtureState();
    try {
      await writeFile(join(dir, 'beast.db'), 'project sqlite bytes', 'utf8');
      await expect(createEncryptedStateBackup({
        stateDir: join(dir, 'state'),
        outputPath: join(dir, 'beast.db'),
        keyFilePath: keyFile,
      })).rejects.toThrow(/aliases a live input/);
      await expect(createEncryptedStateBackup({
        stateDir: join(dir, 'state'),
        outputPath: keyFile,
        keyFilePath: keyFile,
      })).rejects.toThrow(/must not be the key file/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
