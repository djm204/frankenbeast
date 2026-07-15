import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { SqliteBrain } from '@franken/brain';
import type { BrainSnapshot } from '@franken/types';
import { parseArgs } from '../../../src/cli/args.js';
import { diffMemorySnapshots, handleMemoryCommand, verifyMemoryBackup } from '../../../src/cli/memory-snapshot-diff.js';

const baseSnapshot: BrainSnapshot = {
  version: 1,
  timestamp: '2026-07-11T00:00:00.000Z',
  working: {
    keep: { same: true },
    remove: 'old',
    change: { count: 1 },
  },
  episodic: [
    {
      id: 1,
      type: 'observation',
      summary: 'existing event',
      createdAt: '2026-07-11T00:00:01.000Z',
    },
    {
      id: 2,
      type: 'failure',
      summary: 'removed event',
      createdAt: '2026-07-11T00:00:02.000Z',
    },
  ],
  checkpoint: null,
  metadata: {
    lastProvider: 'claude',
    switchReason: '',
    totalTokensUsed: 10,
  },
};

describe('memory snapshot-diff CLI args', () => {
  it('parses the memory snapshot-diff command and snapshot paths', () => {
    const args = parseArgs(['memory', 'snapshot-diff', 'before.json', 'after.json']);

    expect(args.subcommand).toBe('memory');
    expect(args.memoryAction).toBe('snapshot-diff');
    expect(args.memorySnapshotBefore).toBe('before.json');
    expect(args.memorySnapshotAfter).toBe('after.json');
  });

  it('rejects unknown memory actions explicitly', () => {
    expect(() => parseArgs(['memory', 'unknown'])).toThrow(/Unknown memory action: unknown/);
  });

  it('parses the memory verify-backup command and backup path', () => {
    const args = parseArgs(['memory', 'verify-backup', 'memory-backup.sqlite']);

    expect(args.subcommand).toBe('memory');
    expect(args.memoryAction).toBe('verify-backup');
    expect(args.memoryBackupPath).toBe('memory-backup.sqlite');
  });

  it('rejects extra verify-backup positionals with actionable guidance', () => {
    expect(() => parseArgs(['memory', 'verify-backup', 'backup.sqlite', 'extra'])).toThrow(
      /memory verify-backup accepts exactly one backup file/,
    );
  });
});

describe('diffMemorySnapshots', () => {
  it('reports deterministic structured changes across working, episodic, checkpoint, and metadata memory', () => {
    const after: BrainSnapshot = {
      ...baseSnapshot,
      timestamp: '2026-07-11T00:10:00.000Z',
      working: {
        keep: { same: true },
        change: { count: 2 },
        add: 'new',
      },
      episodic: [
        {
          id: 1,
          type: 'observation',
          summary: 'existing event updated',
          createdAt: '2026-07-11T00:00:01.000Z',
        },
        {
          id: 3,
          type: 'success',
          summary: 'added event',
          createdAt: '2026-07-11T00:00:03.000Z',
        },
      ],
      checkpoint: {
        runId: 'run-1',
        phase: 'execute',
        step: 1,
        context: { task: 't1' },
        timestamp: '2026-07-11T00:09:00.000Z',
      },
      metadata: {
        lastProvider: 'codex',
        switchReason: 'fallback',
        totalTokensUsed: 20,
      },
    };

    const report = diffMemorySnapshots('before.json', baseSnapshot, 'after.json', after);

    expect(report.summary).toEqual({
      workingAdded: 1,
      workingRemoved: 1,
      workingChanged: 1,
      episodicAdded: 1,
      episodicRemoved: 1,
      episodicChanged: 1,
      checkpointChanged: true,
      metadataChanged: true,
    });
    expect(report.diff.working.added).toEqual({ add: 'new' });
    expect(report.diff.working.removed).toEqual({ remove: 'old' });
    expect(report.diff.working.changed.change).toEqual({ before: { count: 1 }, after: { count: 2 } });
    expect(report.diff.working.unchanged).toEqual(['keep']);
    expect(report.diff.episodic.changed['id:1']?.after.summary).toBe('existing event updated');
  });
});

describe('handleMemoryCommand', () => {
  it('prints JSON diff for valid snapshot files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'memory-snapshot-diff-'));
    const beforePath = join(dir, 'before.json');
    const afterPath = join(dir, 'after.json');
    await writeFile(beforePath, JSON.stringify(baseSnapshot));
    await writeFile(afterPath, JSON.stringify({
      ...baseSnapshot,
      timestamp: '2026-07-11T00:01:00.000Z',
      working: { ...baseSnapshot.working, add: true },
    }));
    const printed: string[] = [];

    await handleMemoryCommand({
      action: 'snapshot-diff',
      beforePath,
      afterPath,
      print: (message) => printed.push(message),
    });

    expect(printed).toHaveLength(1);
    expect(JSON.parse(printed[0]!)).toMatchObject({
      ok: true,
      command: 'memory snapshot-diff',
      summary: { workingAdded: 1 },
    });
  });

  it('fails with actionable guidance when a snapshot is invalid', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'memory-snapshot-diff-invalid-'));
    const beforePath = join(dir, 'before.json');
    const afterPath = join(dir, 'after.json');
    await writeFile(beforePath, JSON.stringify({ version: 1 }));
    await writeFile(afterPath, JSON.stringify(baseSnapshot));

    await expect(handleMemoryCommand({
      action: 'snapshot-diff',
      beforePath,
      afterPath,
      print: () => undefined,
    })).rejects.toThrow(/Invalid memory snapshot/);
  });

  it('prints structured JSON for a valid read-only SQLite memory backup', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'memory-backup-verify-'));
    const dbPath = join(dir, 'memory.sqlite');
    const backupPath = join(dir, 'memory-backup.sqlite');
    const brain = new SqliteBrain(dbPath);
    brain.working.set('operator', { name: 'beast' });
    brain.episodic.record({
      type: 'observation',
      summary: 'backup verification fixture',
      createdAt: '2026-07-11T00:00:00.000Z',
    });
    brain.recovery.checkpoint({
      runId: 'run-verify-backup',
      phase: 'backup',
      step: 1,
      context: { fixture: true },
      timestamp: '2026-07-11T00:00:01.000Z',
    });
    brain.flush();
    brain.close();

    const liveDb = new Database(dbPath);
    liveDb.exec(`VACUUM INTO '${backupPath.replace(/'/gu, "''")}'`);
    liveDb.close();

    const printed: string[] = [];
    await handleMemoryCommand({
      action: 'verify-backup',
      backupPath,
      print: (message) => printed.push(message),
    });

    expect(printed).toHaveLength(1);
    expect(JSON.parse(printed[0]!)).toMatchObject({
      ok: true,
      command: 'memory verify-backup',
      integrity: { integrityCheck: 'ok', quickCheck: 'ok' },
      schema: { requiredTablesPresent: true },
      summary: { workingEntries: 1, episodicEvents: 1, checkpoints: 1 },
    });
  });

  it('fails explicitly when a backup is missing required memory tables', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'memory-backup-verify-invalid-'));
    const backupPath = join(dir, 'partial.sqlite');
    const db = new Database(backupPath);
    db.exec('CREATE TABLE working_memory (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL, schema_version INTEGER NOT NULL DEFAULT 1)');
    db.close();

    expect(() => verifyMemoryBackup(backupPath)).toThrow(/missing required table\(s\): memory_schema_versions, episodic_events, checkpoints/);
  });
});
