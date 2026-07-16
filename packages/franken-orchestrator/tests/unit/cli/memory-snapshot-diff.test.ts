import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { SqliteBrain } from '@franken/brain';
import type { BrainSnapshot } from '@franken/types';
import { parseArgs } from '../../../src/cli/args.js';
import { diffMemorySnapshots, generateDuplicateMemoryReport, handleMemoryCommand, verifyMemoryBackup } from '../../../src/cli/memory-snapshot-diff.js';

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

const VALID_CHECKPOINT_STATE_SQL = '{"runId":"run-1","phase":"execute","step":1,"context":{},"timestamp":"2026-07-11T00:00:02.000Z"}';

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

  it('parses the memory duplicate-report command and snapshot path', () => {
    const args = parseArgs(['memory', 'duplicate-report', 'snapshot.json']);

    expect(args.subcommand).toBe('memory');
    expect(args.memoryAction).toBe('duplicate-report');
    expect(args.memoryDuplicateReportPath).toBe('snapshot.json');
  });

  it('rejects extra duplicate-report positionals with actionable guidance', () => {
    expect(() => parseArgs(['memory', 'duplicate-report', 'snapshot.json', 'extra'])).toThrow(
      /memory duplicate-report accepts exactly one snapshot file/,
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


describe('generateDuplicateMemoryReport', () => {
  it('reports deterministic working and episodic consolidation candidates', () => {
    const snapshot: BrainSnapshot = {
      ...baseSnapshot,
      working: {
        alpha: { fact: 'Operator prefers terse updates' },
        beta: { fact: 'Operator prefers terse updates' },
        gamma: { fact: 'Different fact' },
      },
      episodic: [
        {
          id: 11,
          type: 'observation',
          summary: 'User prefers concise updates',
          details: { source: 'profile' },
          createdAt: '2026-07-11T00:00:01.000Z',
        },
        {
          id: 12,
          type: 'observation',
          summary: 'User prefers concise updates',
          details: { source: 'profile' },
          createdAt: '2026-07-11T00:00:02.000Z',
        },
        {
          id: 13,
          type: 'decision',
          summary: 'Keep separate decisions distinct',
          createdAt: '2026-07-11T00:00:03.000Z',
        },
      ],
    };

    const report = generateDuplicateMemoryReport('snapshot.json', snapshot);

    expect(report.summary).toEqual({
      duplicateGroups: 2,
      duplicateEntries: 4,
      workingDuplicateGroups: 1,
      workingDuplicateEntries: 2,
      episodicDuplicateGroups: 1,
      episodicDuplicateEntries: 2,
    });
    expect(report.groups[0]).toMatchObject({
      id: 'dup-001',
      suggestedCanonical: { kind: 'working', key: 'alpha' },
      entries: [{ kind: 'working', key: 'alpha' }, { kind: 'working', key: 'beta' }],
    });
    expect(report.groups[1]?.entries.map((entry) => entry.eventId)).toEqual([11, 12]);
    expect(report.groups[0]?.normalizedHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.guidance.join(' ')).toContain('Review each group before deleting memory');
  });

  it('returns an explicit empty report when no duplicates exist', () => {
    const report = generateDuplicateMemoryReport('snapshot.json', baseSnapshot);

    expect(report.summary.duplicateGroups).toBe(0);
    expect(report.groups).toEqual([]);
    expect(report.guidance[0]).toContain('No duplicate');
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

  it('prints JSON duplicate report for a valid snapshot file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'memory-duplicate-report-'));
    const snapshotPath = join(dir, 'snapshot.json');
    await writeFile(snapshotPath, JSON.stringify({
      ...baseSnapshot,
      working: { one: 'same', two: 'same' },
    }));
    const printed: string[] = [];

    await handleMemoryCommand({
      action: 'duplicate-report',
      snapshotPath,
      print: (message) => printed.push(message),
    });

    expect(printed).toHaveLength(1);
    expect(JSON.parse(printed[0]!)).toMatchObject({
      ok: true,
      command: 'memory duplicate-report',
      summary: { duplicateGroups: 1, workingDuplicateEntries: 2 },
    });
  });

  it('requires a snapshot path for duplicate-report', async () => {
    await expect(handleMemoryCommand({
      action: 'duplicate-report',
      print: () => undefined,
    })).rejects.toThrow(/memory duplicate-report requires one BrainSnapshot JSON file/);
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

  it('accepts legacy pre-migration backups without schema metadata or row versions', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'memory-backup-verify-legacy-'));
    const backupPath = join(dir, 'legacy.sqlite');
    const db = new Database(backupPath);
    db.exec(`
      CREATE TABLE working_memory (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE episodic_events (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, step TEXT, summary TEXT NOT NULL, details TEXT, embedding BLOB, created_at TEXT NOT NULL);
      CREATE TABLE checkpoints (id INTEGER PRIMARY KEY AUTOINCREMENT, state TEXT NOT NULL, created_at TEXT NOT NULL);
      INSERT INTO working_memory (key, value, updated_at) VALUES ('legacy', 'plaintext', '2026-07-11T00:00:00.000Z');
      INSERT INTO episodic_events (type, step, summary, details, created_at) VALUES ('observation', NULL, 'legacy event', '{"source":"legacy"}', '2026-07-11T00:00:01.000Z');
      INSERT INTO checkpoints (state, created_at) VALUES ('${VALID_CHECKPOINT_STATE_SQL}', '2026-07-11T00:00:02.000Z');
    `);
    db.close();

    expect(verifyMemoryBackup(backupPath)).toMatchObject({
      schema: {
        version: 1,
        requiredTablesPresent: true,
        stores: [
          { store: 'working_memory', version: 0, recordCount: 1 },
          { store: 'episodic_events', version: 0, recordCount: 1 },
          { store: 'checkpoints', version: 0, recordCount: 1 },
        ],
      },
      summary: { workingEntries: 1, episodicEvents: 1, checkpoints: 1 },
    });
  });

  it('rejects encrypted-looking plaintext JSON payloads unless metadata marks the store encrypted', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'memory-backup-verify-encryption-marker-'));
    const backupPath = join(dir, 'marker.sqlite');
    const db = new Database(backupPath);
    db.exec(`
      CREATE TABLE working_memory (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE episodic_events (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, step TEXT, summary TEXT NOT NULL, details TEXT, embedding BLOB, created_at TEXT NOT NULL);
      CREATE TABLE checkpoints (id INTEGER PRIMARY KEY AUTOINCREMENT, state TEXT NOT NULL, created_at TEXT NOT NULL);
      INSERT INTO episodic_events (type, step, summary, details, created_at) VALUES ('observation', NULL, 'bad marker', 'enc:v1:not-really-json', '2026-07-11T00:00:01.000Z');
      INSERT INTO checkpoints (state, created_at) VALUES ('${VALID_CHECKPOINT_STATE_SQL}', '2026-07-11T00:00:02.000Z');
    `);
    db.close();

    expect(() => verifyMemoryBackup(backupPath)).toThrow(/Unexpected encrypted payload marker in plaintext episodic_events\.details/);
  });

  it('rejects plaintext payloads in stores marked encrypted', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'memory-backup-verify-encrypted-plaintext-'));
    const backupPath = join(dir, 'encrypted-plaintext.sqlite');
    const db = new Database(backupPath);
    db.exec(`
      CREATE TABLE working_memory (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE episodic_events (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, step TEXT, summary TEXT NOT NULL, details TEXT, embedding BLOB, created_at TEXT NOT NULL);
      CREATE TABLE checkpoints (id INTEGER PRIMARY KEY AUTOINCREMENT, state TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE memory_encryption_status (store TEXT PRIMARY KEY, encrypted INTEGER NOT NULL, algorithm TEXT, verifier TEXT, updated_at TEXT NOT NULL);
      INSERT INTO memory_encryption_status VALUES ('episodic_events', 1, 'aes-256-gcm', 'enc:v1:nonce:tag:ciphertext', '2026-07-11T00:00:00.000Z');
      INSERT INTO episodic_events (type, step, summary, details, created_at) VALUES ('observation', NULL, 'plaintext summary', 'enc:v1:nonce:tag:ciphertext', '2026-07-11T00:00:01.000Z');
    `);
    db.close();

    expect(() => verifyMemoryBackup(backupPath)).toThrow(/Plaintext payload in encrypted memory store episodic_events\.summary/);
  });

  it('requires verifier metadata for encrypted memory stores', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'memory-backup-verify-missing-verifier-'));
    const backupPath = join(dir, 'missing-verifier.sqlite');
    const db = new Database(backupPath);
    db.exec(`
      CREATE TABLE working_memory (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE episodic_events (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, step TEXT, summary TEXT NOT NULL, details TEXT, embedding BLOB, created_at TEXT NOT NULL);
      CREATE TABLE checkpoints (id INTEGER PRIMARY KEY AUTOINCREMENT, state TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE memory_encryption_status (store TEXT PRIMARY KEY, encrypted INTEGER NOT NULL, algorithm TEXT, verifier TEXT, updated_at TEXT NOT NULL);
      INSERT INTO memory_encryption_status VALUES ('working_memory', 1, 'aes-256-gcm', NULL, '2026-07-11T00:00:00.000Z');
    `);
    db.close();

    expect(() => verifyMemoryBackup(backupPath)).toThrow(/Encrypted memory store working_memory is missing verifier metadata/);
  });

  it('validates required columns before reporting a backup as valid', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'memory-backup-verify-columns-'));
    const backupPath = join(dir, 'malformed.sqlite');
    const db = new Database(backupPath);
    db.exec(`
      CREATE TABLE working_memory (key TEXT PRIMARY KEY, updated_at TEXT NOT NULL);
      CREATE TABLE episodic_events (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, step TEXT, summary TEXT NOT NULL, details TEXT, embedding BLOB, created_at TEXT NOT NULL);
      CREATE TABLE checkpoints (id INTEGER PRIMARY KEY AUTOINCREMENT, state TEXT NOT NULL, created_at TEXT NOT NULL);
    `);
    db.close();

    expect(() => verifyMemoryBackup(backupPath)).toThrow(/working_memory is missing required column\(s\): value/);
  });

  it('rejects encrypted stores without verifier metadata', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'memory-backup-verify-missing-verifier-'));
    const backupPath = join(dir, 'missing-verifier.sqlite');
    const db = new Database(backupPath);
    db.exec(`
      CREATE TABLE working_memory (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE episodic_events (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, step TEXT, summary TEXT NOT NULL, details TEXT, embedding BLOB, created_at TEXT NOT NULL);
      CREATE TABLE checkpoints (id INTEGER PRIMARY KEY AUTOINCREMENT, state TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE memory_encryption_status (store TEXT PRIMARY KEY, encrypted INTEGER NOT NULL, algorithm TEXT, verifier TEXT, updated_at TEXT NOT NULL);
      INSERT INTO memory_encryption_status (store, encrypted, algorithm, verifier, updated_at) VALUES ('working_memory', 1, 'aes-256-gcm', NULL, '2026-07-11T00:00:00.000Z');
    `);
    db.close();

    expect(() => verifyMemoryBackup(backupPath)).toThrow(/working_memory is missing verifier metadata/);
  });

  it('validates encrypted episodic summaries', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'memory-backup-verify-encrypted-summary-'));
    const backupPath = join(dir, 'encrypted-summary.sqlite');
    const db = new Database(backupPath);
    db.exec(`
      CREATE TABLE working_memory (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE episodic_events (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, step TEXT, summary TEXT NOT NULL, details TEXT, embedding BLOB, created_at TEXT NOT NULL);
      CREATE TABLE checkpoints (id INTEGER PRIMARY KEY AUTOINCREMENT, state TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE memory_encryption_status (store TEXT PRIMARY KEY, encrypted INTEGER NOT NULL, algorithm TEXT, verifier TEXT, updated_at TEXT NOT NULL);
      INSERT INTO memory_encryption_status (store, encrypted, algorithm, verifier, updated_at) VALUES ('episodic_events', 1, 'aes-256-gcm', 'enc:v1:iv:tag:ciphertext', '2026-07-11T00:00:00.000Z');
      INSERT INTO episodic_events (type, step, summary, details, created_at) VALUES ('observation', NULL, 'plaintext summary', 'enc:v1:iv:tag:ciphertext', '2026-07-11T00:00:01.000Z');
      INSERT INTO checkpoints (state, created_at) VALUES ('${VALID_CHECKPOINT_STATE_SQL}', '2026-07-11T00:00:02.000Z');
    `);
    db.close();

    expect(() => verifyMemoryBackup(backupPath)).toThrow(/Plaintext payload in encrypted memory store episodic_events\.summary/);
  });

  it('rejects plaintext rows in encrypted stores', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'memory-backup-verify-mixed-encryption-'));
    const backupPath = join(dir, 'mixed-encryption.sqlite');
    const db = new Database(backupPath);
    db.exec(`
      CREATE TABLE working_memory (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE episodic_events (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, step TEXT, summary TEXT NOT NULL, details TEXT, embedding BLOB, created_at TEXT NOT NULL);
      CREATE TABLE checkpoints (id INTEGER PRIMARY KEY AUTOINCREMENT, state TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE memory_encryption_status (store TEXT PRIMARY KEY, encrypted INTEGER NOT NULL, algorithm TEXT, verifier TEXT, updated_at TEXT NOT NULL);
      INSERT INTO memory_encryption_status (store, encrypted, algorithm, verifier, updated_at) VALUES ('working_memory', 1, 'aes-256-gcm', 'enc:v1:iv:tag:ciphertext', '2026-07-11T00:00:00.000Z');
      INSERT INTO working_memory (key, value, updated_at) VALUES ('mixed', '${VALID_CHECKPOINT_STATE_SQL}', '2026-07-11T00:00:01.000Z');
      INSERT INTO checkpoints (state, created_at) VALUES ('${VALID_CHECKPOINT_STATE_SQL}', '2026-07-11T00:00:02.000Z');
    `);
    db.close();

    expect(() => verifyMemoryBackup(backupPath)).toThrow(/Plaintext payload in encrypted memory store working_memory\.value/);
  });

  it('rejects non-text JSON payload columns', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'memory-backup-verify-blob-payload-'));
    const backupPath = join(dir, 'blob-payload.sqlite');
    const db = new Database(backupPath);
    db.exec(`
      CREATE TABLE working_memory (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE episodic_events (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, step TEXT, summary TEXT NOT NULL, details TEXT, embedding BLOB, created_at TEXT NOT NULL);
      CREATE TABLE checkpoints (id INTEGER PRIMARY KEY AUTOINCREMENT, state TEXT NOT NULL, created_at TEXT NOT NULL);
      INSERT INTO checkpoints (state, created_at) VALUES (X'010203', '2026-07-11T00:00:02.000Z');
    `);
    db.close();

    expect(() => verifyMemoryBackup(backupPath)).toThrow(/Non-text payload in checkpoints\.state/);
  });

  it('rejects malformed encryption verifier markers', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'memory-backup-verify-verifier-marker-'));
    const backupPath = join(dir, 'verifier-marker.sqlite');
    const db = new Database(backupPath);
    db.exec(`
      CREATE TABLE working_memory (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE episodic_events (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, step TEXT, summary TEXT NOT NULL, details TEXT, embedding BLOB, created_at TEXT NOT NULL);
      CREATE TABLE checkpoints (id INTEGER PRIMARY KEY AUTOINCREMENT, state TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE memory_encryption_status (store TEXT PRIMARY KEY, encrypted INTEGER NOT NULL, algorithm TEXT, verifier TEXT, updated_at TEXT NOT NULL);
      INSERT INTO memory_encryption_status VALUES ('working_memory', 1, 'aes-256-gcm', 'xxxxxxxiv:tag:ciphertext', '2026-07-11T00:00:00.000Z');
      INSERT INTO working_memory (key, value, updated_at) VALUES ('secret', 'enc:v1:iv:tag:ciphertext', '2026-07-11T00:00:01.000Z');
    `);
    db.close();

    expect(() => verifyMemoryBackup(backupPath)).toThrow(/missing enc:v1: marker/);
  });

  it('requires current-schema deletion guard tables when schema metadata exists', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'memory-backup-verify-current-tables-'));
    const backupPath = join(dir, 'current-missing-deletion.sqlite');
    const db = new Database(backupPath);
    db.exec(`
      CREATE TABLE working_memory (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE episodic_events (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, step TEXT, summary TEXT NOT NULL, details TEXT, embedding BLOB, created_at TEXT NOT NULL);
      CREATE TABLE checkpoints (id INTEGER PRIMARY KEY AUTOINCREMENT, state TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE memory_schema_versions (store TEXT PRIMARY KEY, version INTEGER NOT NULL, migrated_at TEXT NOT NULL);
      INSERT INTO memory_schema_versions VALUES ('working_memory', 1, '2026-07-11T00:00:00.000Z');
    `);
    db.close();

    expect(() => verifyMemoryBackup(backupPath)).toThrow(/Current memory backup is missing required table\(s\): memory_deletion_guards, memory_deletion_hash_keys/);
  });

  it('validates checkpoint state shape', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'memory-backup-verify-checkpoint-shape-'));
    const backupPath = join(dir, 'bad-checkpoint.sqlite');
    const db = new Database(backupPath);
    db.exec(`
      CREATE TABLE working_memory (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE episodic_events (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, step TEXT, summary TEXT NOT NULL, details TEXT, embedding BLOB, created_at TEXT NOT NULL);
      CREATE TABLE checkpoints (id INTEGER PRIMARY KEY AUTOINCREMENT, state TEXT NOT NULL, created_at TEXT NOT NULL);
      INSERT INTO checkpoints (state, created_at) VALUES ('{"ok":true}', '2026-07-11T00:00:02.000Z');
    `);
    db.close();

    expect(() => verifyMemoryBackup(backupPath)).toThrow(/Invalid checkpoint state/);
  });

  it('requires canonical deletion hash key when deletion guards exist', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'memory-backup-verify-deletion-key-'));
    const backupPath = join(dir, 'missing-canonical-key.sqlite');
    const db = new Database(backupPath);
    db.exec(`
      CREATE TABLE working_memory (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE episodic_events (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, step TEXT, summary TEXT NOT NULL, details TEXT, embedding BLOB, created_at TEXT NOT NULL);
      CREATE TABLE checkpoints (id INTEGER PRIMARY KEY AUTOINCREMENT, state TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE memory_schema_versions (store TEXT PRIMARY KEY, version INTEGER NOT NULL, migrated_at TEXT NOT NULL);
      CREATE TABLE memory_deletion_guards (selector_hash TEXT NOT NULL, guard_kind TEXT NOT NULL, value_hash TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE memory_deletion_hash_keys (id TEXT PRIMARY KEY, key_material TEXT NOT NULL, created_at TEXT NOT NULL);
      INSERT INTO memory_schema_versions VALUES ('working_memory', 1, '2026-07-11T00:00:00.000Z');
      INSERT INTO memory_deletion_guards VALUES ('selector', 'working-key', 'value', '2026-07-11T00:00:01.000Z');
      INSERT INTO memory_deletion_hash_keys VALUES ('other-key', 'material', '2026-07-11T00:00:01.000Z');
    `);
    db.close();

    expect(() => verifyMemoryBackup(backupPath)).toThrow(/missing canonical deletion hash key right-to-forget-hmac-v1/);
  });

  it('fails explicitly when a backup is missing required memory tables', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'memory-backup-verify-invalid-'));
    const backupPath = join(dir, 'partial.sqlite');
    const db = new Database(backupPath);
    db.exec('CREATE TABLE working_memory (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL, schema_version INTEGER NOT NULL DEFAULT 1)');
    db.close();

    expect(() => verifyMemoryBackup(backupPath)).toThrow(/missing required table\(s\): episodic_events, checkpoints/);
  });
});
