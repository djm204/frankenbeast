import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { getProjectPaths, scaffoldFrankenbeast } from '../../../src/cli/project-root.js';
import {
  writeDesignDoc,
  readDesignDoc,
  writeChunkFiles,
  clearChunkFiles,
} from '../../../src/cli/file-writer.js';
import type { ChunkDefinition } from '../../../src/cli/file-writer.js';

describe('file-writer (design doc)', () => {
  const testDir = resolve(tmpdir(), 'fb-test-file-writer');
  let paths: ReturnType<typeof getProjectPaths>;

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    paths = getProjectPaths(testDir);
    scaffoldFrankenbeast(paths);
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('writeDesignDoc', () => {
    it('writes design doc to plans directory', () => {
      const result = writeDesignDoc(paths, '# My Design');
      expect(result).toBe(paths.designDocFile);
      expect(readFileSync(paths.designDocFile, 'utf-8')).toBe('# My Design');
    });

    it('overwrites existing design doc', () => {
      writeDesignDoc(paths, 'v1');
      writeDesignDoc(paths, 'v2');
      expect(readFileSync(paths.designDocFile, 'utf-8')).toBe('v2');
    });

    it('returns the absolute path', () => {
      const result = writeDesignDoc(paths, 'content');
      expect(result).toContain('.fbeast/plans/design.md');
    });
  });

  describe('readDesignDoc', () => {
    it('reads existing design doc', () => {
      writeDesignDoc(paths, '# Existing');
      expect(readDesignDoc(paths)).toBe('# Existing');
    });

    it('returns undefined when no design doc exists', () => {
      expect(readDesignDoc(paths)).toBeUndefined();
    });
  });
});

describe('file-writer (chunk files)', () => {
  const testDir = resolve(tmpdir(), 'fb-test-chunk-files');
  let paths: ReturnType<typeof getProjectPaths>;

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    paths = getProjectPaths(testDir);
    scaffoldFrankenbeast(paths);
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  const sampleChunks: ChunkDefinition[] = [
    {
      id: 'auth-system',
      objective: 'Implement user authentication',
      files: ['src/auth.ts', 'tests/auth.test.ts'],
      successCriteria: 'Auth tests pass',
      verificationCommand: 'npx vitest run tests/auth.test.ts',
      dependencies: [],
    },
    {
      id: 'user-db',
      objective: 'Set up user database',
      files: ['src/db.ts'],
      successCriteria: 'DB connection established',
      verificationCommand: 'npx vitest run tests/db.test.ts',
      dependencies: ['auth-system'],
    },
  ];

  describe('writeChunkFiles', () => {
    it('writes numbered chunk files', () => {
      const result = writeChunkFiles(paths, sampleChunks);
      expect(result).toHaveLength(2);
      expect(result[0]).toContain('01_auth-system.md');
      expect(result[1]).toContain('02_user-db.md');
      expect(existsSync(result[0])).toBe(true);
      expect(existsSync(result[1])).toBe(true);
    });

    it('writes correct content format', () => {
      const result = writeChunkFiles(paths, sampleChunks);
      const content = readFileSync(result[0], 'utf-8');
      expect(content).toContain('# Chunk 01: auth-system');
      expect(content).toContain('## Objective');
      expect(content).toContain('Implement user authentication');
      expect(content).toContain('## Files');
      expect(content).toContain('- src/auth.ts');
      expect(content).toContain('## Success Criteria');
      expect(content).toContain('## Verification Command');
      expect(content).toContain('npx vitest run tests/auth.test.ts');
    });

    it('includes dependencies section when present', () => {
      const result = writeChunkFiles(paths, sampleChunks);
      const content = readFileSync(result[1], 'utf-8');
      expect(content).toContain('## Dependencies');
      expect(content).toContain('- auth-system');
    });

    it('omits dependencies section when empty', () => {
      const result = writeChunkFiles(paths, sampleChunks);
      const content = readFileSync(result[0], 'utf-8');
      expect(content).not.toContain('## Dependencies');
    });

    it('clears existing chunks before writing', () => {
      writeChunkFiles(paths, sampleChunks);
      const newChunks = [sampleChunks[0]];
      const result = writeChunkFiles(paths, newChunks);
      expect(result).toHaveLength(1);
      // Old 02_ file should be gone
      const files = readdirSync(paths.plansDir).filter((f) => /^\d{2}/.test(f));
      expect(files).toHaveLength(1);
    });
  });

  describe('clearChunkFiles', () => {
    it('removes numbered md files', () => {
      writeChunkFiles(paths, sampleChunks);
      clearChunkFiles(paths);
      const files = readdirSync(paths.plansDir).filter((f) => /^\d{2}/.test(f));
      expect(files).toHaveLength(0);
    });

    it('does not remove design.md', () => {
      writeDesignDoc(paths, '# Design');
      writeChunkFiles(paths, sampleChunks);
      clearChunkFiles(paths);
      expect(existsSync(paths.designDocFile)).toBe(true);
    });

    it('handles empty directory gracefully', () => {
      expect(() => clearChunkFiles(paths)).not.toThrow();
    });
  });
});
