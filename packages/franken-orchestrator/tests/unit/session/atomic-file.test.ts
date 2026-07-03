import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { atomicWriteFileSync, quarantineFile, readJsonFileOrQuarantine } from '../../../src/session/atomic-file.js';

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

    it('leaves no temp files behind after a write', () => {
      const dir = makeTmpDir('atomic-write-tmp-');
      const filePath = join(dir, 'session.json');

      atomicWriteFileSync(filePath, '{"a":1}');
      atomicWriteFileSync(filePath, '{"a":2}');

      const leftovers = readdirSync(dir).filter((f) => f !== 'session.json');
      expect(leftovers).toEqual([]);
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

    it('cleans up the temp file if the write fails', () => {
      const dir = makeTmpDir('atomic-write-fail-');
      // Target directory does not exist -> rename fails.
      const filePath = join(dir, 'missing-subdir', 'session.json');

      expect(() => atomicWriteFileSync(filePath, '{}')).toThrow();

      const leftovers = readdirSync(dir);
      expect(leftovers).toEqual([]);
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
