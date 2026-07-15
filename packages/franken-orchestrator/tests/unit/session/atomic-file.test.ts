import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  atomicWriteFileSync,
  quarantineFile,
  readJsonFileOrQuarantine,
  readStateWriteTransactionJournal,
  recoverStateWriteTransaction,
  stateWriteJournalPath,
} from '../../../src/session/atomic-file.js';

describe('atomic-file', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function makeTmpDir(prefix: string): string {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    tmpDirs.push(dir);
    return dir;
  }

  describe('atomicWriteFileSync()', () => {
    it('writes the full contents to the target path', () => {
      const dir = makeTmpDir('atomic-write-');
      const filePath = join(dir, 'session.json');

      atomicWriteFileSync(filePath, '{"a":1}');

      expect(readFileSync(filePath, 'utf-8')).toBe('{"a":1}');
    });

    it('leaves no temp files or state write journal behind after a write', () => {
      const dir = makeTmpDir('atomic-write-tmp-');
      const filePath = join(dir, 'session.json');

      atomicWriteFileSync(filePath, '{"a":1}');
      atomicWriteFileSync(filePath, '{"a":2}');

      const leftovers = readdirSync(dir).filter((f) => f !== 'session.json');
      expect(leftovers).toEqual([]);
      expect(readStateWriteTransactionJournal(filePath)).toBeUndefined();
    });

    it('replaces existing content atomically via rename (never a partially written final file)', () => {
      const dir = makeTmpDir('atomic-write-replace-');
      const filePath = join(dir, 'session.json');
      writeFileSync(filePath, '{"old":true}');

      atomicWriteFileSync(filePath, '{"new":true}');

      // The target file is either the fully-old or fully-new content — a
      // temp-file + rename write can never leave a torn/half-written file.
      expect(readFileSync(filePath, 'utf-8')).toBe('{"new":true}');
    });

    it('cleans up the temp file and journal if the write fails', () => {
      const dir = makeTmpDir('atomic-write-fail-');
      // Target directory does not exist -> journal/open fails.
      const filePath = join(dir, 'missing-subdir', 'session.json');

      expect(() => atomicWriteFileSync(filePath, '{}')).toThrow();

      const leftovers = readdirSync(dir);
      expect(leftovers).toEqual([]);
    });

    it('journals and recovers an interrupted temp-file write before the next save', () => {
      const dir = makeTmpDir('atomic-write-recover-');
      const filePath = join(dir, 'session.json');
      const tempPath = `${filePath}.tmp.interrupted`;
      writeFileSync(filePath, '{"old":true}');
      writeFileSync(tempPath, '{"new":');
      writeFileSync(
        stateWriteJournalPath(filePath),
        JSON.stringify({
          schemaVersion: 1,
          targetPath: filePath,
          tempPath,
          phase: 'writing-temp',
          startedAt: '1970-01-01T00:00:00.000Z',
          updatedAt: '1970-01-01T00:00:01.000Z',
        }),
        'utf8',
      );

      atomicWriteFileSync(filePath, '{"new":true}');

      expect(existsSync(tempPath)).toBe(false);
      expect(existsSync(stateWriteJournalPath(filePath))).toBe(false);
      expect(readFileSync(filePath, 'utf-8')).toBe('{"new":true}');
    });
  });

  describe('recoverStateWriteTransaction()', () => {
    it('reports stale temp-file cleanup from a valid journal', () => {
      const dir = makeTmpDir('state-write-journal-recover-');
      const filePath = join(dir, 'state.json');
      const tempPath = `${filePath}.tmp.stale`;
      writeFileSync(filePath, '{"old":true}');
      writeFileSync(tempPath, '{"new":');
      writeFileSync(
        stateWriteJournalPath(filePath),
        JSON.stringify({
          schemaVersion: 1,
          targetPath: filePath,
          tempPath,
          phase: 'renaming',
          startedAt: '1970-01-01T00:00:00.000Z',
          updatedAt: '1970-01-01T00:00:01.000Z',
        }),
        'utf8',
      );

      const recovery = recoverStateWriteTransaction(filePath);

      expect(recovery).toMatchObject({
        journalPath: stateWriteJournalPath(filePath),
        targetPath: filePath,
        tempPath,
        action: 'removed-stale-temp',
      });
      expect(existsSync(tempPath)).toBe(false);
      expect(existsSync(stateWriteJournalPath(filePath))).toBe(false);
      expect(readFileSync(filePath, 'utf-8')).toBe('{"old":true}');
    });

    it('quarantines malformed journal JSON instead of throwing', () => {
      const dir = makeTmpDir('state-write-journal-malformed-');
      const filePath = join(dir, 'state.json');
      writeFileSync(stateWriteJournalPath(filePath), '{"targetPath":');

      const recovery = recoverStateWriteTransaction(filePath);

      expect(recovery?.action).toBe('quarantined-invalid-journal');
      expect(existsSync(stateWriteJournalPath(filePath))).toBe(false);
      const quarantine = readdirSync(dir).filter((file) => file.includes('.journal.corrupt.'));
      expect(quarantine).toHaveLength(1);
    });

    it('quarantines syntactically valid journals with invalid timestamps', () => {
      const dir = makeTmpDir('state-write-journal-invalid-time-');
      const filePath = join(dir, 'state.json');
      const tempPath = `${filePath}.tmp.invalid-time`;
      writeFileSync(filePath, '{"old":true}');
      writeFileSync(tempPath, '{"new":');
      writeFileSync(
        stateWriteJournalPath(filePath),
        JSON.stringify({
          schemaVersion: 1,
          targetPath: filePath,
          tempPath,
          phase: 'writing-temp',
          startedAt: '1970-01-01T00:00:00.000Z',
          updatedAt: 'not-a-date',
        }),
        'utf8',
      );

      const recovery = recoverStateWriteTransaction(filePath);

      expect(recovery?.action).toBe('quarantined-invalid-journal');
      expect(existsSync(tempPath)).toBe(true);
      expect(existsSync(stateWriteJournalPath(filePath))).toBe(false);
    });

    it('retains active preparing journals even before the temp file exists', () => {
      const dir = makeTmpDir('state-write-journal-active-preparing-');
      const filePath = join(dir, 'state.json');
      const tempPath = `${filePath}.tmp.pending`;
      writeFileSync(filePath, '{"old":true}');
      writeFileSync(
        stateWriteJournalPath(filePath),
        JSON.stringify({
          schemaVersion: 1,
          targetPath: filePath,
          tempPath,
          phase: 'preparing',
          startedAt: '2999-01-01T00:00:00.000Z',
          updatedAt: '2999-01-01T00:00:01.000Z',
        }),
        'utf8',
      );

      const recovery = recoverStateWriteTransaction(filePath);

      expect(recovery).toMatchObject({
        action: 'retained-active-journal',
        tempPath,
      });
      expect(existsSync(tempPath)).toBe(false);
      expect(existsSync(stateWriteJournalPath(filePath))).toBe(true);
    });

    it('does not delete temp files from stale preparing journals because ownership is unproven', () => {
      const dir = makeTmpDir('state-write-journal-stale-preparing-');
      const filePath = join(dir, 'state.json');
      const tempPath = `${filePath}.tmp.preexisting`;
      writeFileSync(filePath, '{"old":true}');
      writeFileSync(tempPath, '{"belongs":"elsewhere"}');
      writeFileSync(
        stateWriteJournalPath(filePath),
        JSON.stringify({
          schemaVersion: 1,
          targetPath: filePath,
          tempPath,
          phase: 'preparing',
          startedAt: '1970-01-01T00:00:00.000Z',
          updatedAt: '1970-01-01T00:00:01.000Z',
        }),
        'utf8',
      );

      const recovery = recoverStateWriteTransaction(filePath);

      expect(recovery).toMatchObject({
        action: 'removed-completed-journal',
        tempPath,
      });
      expect(existsSync(tempPath)).toBe(true);
      expect(readFileSync(tempPath, 'utf-8')).toBe('{"belongs":"elsewhere"}');
      expect(existsSync(stateWriteJournalPath(filePath))).toBe(false);
    });

    it('retains active journals so concurrent writers do not remove live temp files', () => {
      const dir = makeTmpDir('state-write-journal-active-');
      const filePath = join(dir, 'state.json');
      const tempPath = `${filePath}.tmp.live`;
      writeFileSync(filePath, '{"old":true}');
      writeFileSync(tempPath, '{"new":');
      writeFileSync(
        stateWriteJournalPath(filePath),
        JSON.stringify({
          schemaVersion: 1,
          targetPath: filePath,
          tempPath,
          phase: 'writing-temp',
          startedAt: '2999-01-01T00:00:00.000Z',
          updatedAt: '2999-01-01T00:00:01.000Z',
        }),
        'utf8',
      );

      const recovery = recoverStateWriteTransaction(filePath);

      expect(recovery).toMatchObject({
        action: 'retained-active-journal',
        tempPath,
      });
      expect(existsSync(tempPath)).toBe(true);
      expect(existsSync(stateWriteJournalPath(filePath))).toBe(true);
      expect(() => atomicWriteFileSync(filePath, '{"new":true}')).toThrow(/still active/);
    });

    it('quarantines journals with temp paths outside the target sidecar namespace', () => {
      const dir = makeTmpDir('state-write-journal-invalid-temp-');
      const filePath = join(dir, 'state.json');
      const victimPath = join(dir, 'important.json');
      writeFileSync(filePath, '{"old":true}');
      writeFileSync(victimPath, '{"important":true}');
      writeFileSync(
        stateWriteJournalPath(filePath),
        JSON.stringify({
          schemaVersion: 1,
          targetPath: filePath,
          tempPath: victimPath,
          phase: 'writing-temp',
          startedAt: '1970-01-01T00:00:00.000Z',
          updatedAt: '1970-01-01T00:00:01.000Z',
        }),
        'utf8',
      );

      const recovery = recoverStateWriteTransaction(filePath);

      expect(recovery?.action).toBe('quarantined-invalid-journal');
      expect(existsSync(victimPath)).toBe(true);
      expect(readFileSync(victimPath, 'utf-8')).toBe('{"important":true}');
      expect(existsSync(stateWriteJournalPath(filePath))).toBe(false);
    });

    it('quarantines journals with nested paths under a matching temp prefix', () => {
      const dir = makeTmpDir('state-write-journal-nested-temp-');
      const filePath = join(dir, 'state.json');
      const nestedDir = `${filePath}.tmp.backup`;
      const nestedPath = join(nestedDir, 'important.json');
      writeFileSync(filePath, '{"old":true}');
      rmSync(nestedDir, { recursive: true, force: true });
      // mkdtempSync cannot target this exact name, so create via the filesystem API.
      writeFileSync(`${filePath}.tmp.backup-placeholder`, 'placeholder');
      rmSync(`${filePath}.tmp.backup-placeholder`, { force: true });
      mkdirSync(nestedDir);
      writeFileSync(nestedPath, '{"important":true}');
      writeFileSync(
        stateWriteJournalPath(filePath),
        JSON.stringify({
          schemaVersion: 1,
          targetPath: filePath,
          tempPath: nestedPath,
          phase: 'writing-temp',
          startedAt: '1970-01-01T00:00:00.000Z',
          updatedAt: '1970-01-01T00:00:01.000Z',
        }),
        'utf8',
      );

      const recovery = recoverStateWriteTransaction(filePath);

      expect(recovery?.action).toBe('quarantined-invalid-journal');
      expect(existsSync(nestedPath)).toBe(true);
    });

    it('quarantines journals whose temp path is a sidecar directory', () => {
      const dir = makeTmpDir('state-write-journal-dir-temp-');
      const filePath = join(dir, 'state.json');
      const dirTempPath = `${filePath}.tmp.directory`;
      writeFileSync(filePath, '{"old":true}');
      mkdirSync(dirTempPath);
      writeFileSync(
        stateWriteJournalPath(filePath),
        JSON.stringify({
          schemaVersion: 1,
          targetPath: filePath,
          tempPath: dirTempPath,
          phase: 'writing-temp',
          startedAt: '1970-01-01T00:00:00.000Z',
          updatedAt: '1970-01-01T00:00:01.000Z',
        }),
        'utf8',
      );

      const recovery = recoverStateWriteTransaction(filePath);

      expect(recovery?.action).toBe('quarantined-invalid-journal');
      expect(existsSync(dirTempPath)).toBe(true);
    });

    it('normalizes target paths before deciding whether a journal belongs to the file', () => {
      const dir = makeTmpDir('state-write-journal-normalized-target-');
      const filePath = join(dir, 'state.json');
      const tempPath = `${filePath}.tmp.stale`;
      writeFileSync(filePath, '{"old":true}');
      writeFileSync(tempPath, '{"new":');
      writeFileSync(
        stateWriteJournalPath(filePath),
        JSON.stringify({
          schemaVersion: 1,
          targetPath: join(dir, '.', 'state.json'),
          tempPath,
          phase: 'writing-temp',
          startedAt: '1970-01-01T00:00:00.000Z',
          updatedAt: '1970-01-01T00:00:01.000Z',
        }),
        'utf8',
      );

      const recovery = recoverStateWriteTransaction(resolve(dir, 'state.json'));

      expect(recovery?.action).toBe('removed-stale-temp');
      expect(existsSync(tempPath)).toBe(false);
      expect(existsSync(stateWriteJournalPath(filePath))).toBe(false);
    });
  });

  describe('readJsonFileOrQuarantine()', () => {
    it('returns undefined for a missing file', () => {
      const dir = makeTmpDir('read-missing-');
      const filePath = join(dir, 'missing.json');

      expect(readJsonFileOrQuarantine(filePath)).toBeUndefined();
    });

    it('parses valid JSON', () => {
      const dir = makeTmpDir('read-valid-');
      const filePath = join(dir, 'session.json');
      writeFileSync(filePath, JSON.stringify({ chunkId: '01_demo' }));

      expect(readJsonFileOrQuarantine<{ chunkId: string }>(filePath)?.chunkId).toBe('01_demo');
    });

    it('quarantines a truncated/corrupt file instead of throwing', () => {
      const dir = makeTmpDir('read-corrupt-');
      const filePath = join(dir, 'session.json');
      writeFileSync(filePath, '{"chunkId": "01_demo", "trans'); // truncated mid-write

      const result = readJsonFileOrQuarantine(filePath);

      expect(result).toBeUndefined();
      expect(existsSync(filePath)).toBe(false);
      const quarantined = readdirSync(dir).filter((f) => f.includes('.corrupt.'));
      expect(quarantined).toHaveLength(1);
      expect(readFileSync(join(dir, quarantined[0]!), 'utf-8')).toBe('{"chunkId": "01_demo", "trans');
    });
  });

  describe('quarantineFile()', () => {
    it('renames the file aside and preserves its content', () => {
      const dir = makeTmpDir('quarantine-');
      const filePath = join(dir, 'bad.json');
      writeFileSync(filePath, 'not json');

      const quarantinePath = quarantineFile(filePath);

      expect(quarantinePath).toBeDefined();
      expect(existsSync(filePath)).toBe(false);
      expect(existsSync(quarantinePath!)).toBe(true);
      expect(readFileSync(quarantinePath!, 'utf-8')).toBe('not json');
    });

    it('returns undefined without throwing when the file no longer exists', () => {
      const dir = makeTmpDir('quarantine-missing-');
      const filePath = join(dir, 'gone.json');

      expect(() => quarantineFile(filePath)).not.toThrow();
      expect(quarantineFile(filePath)).toBeUndefined();
    });
  });
});
