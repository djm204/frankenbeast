import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { cleanupBuild } from '../../src/cli/cleanup.js';

describe('cleanupBuild', () => {
  let tmpDir: string;
  let buildDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `franken-cleanup-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    buildDir = join(tmpDir, '.fbeast', '.build');
    mkdirSync(buildDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('removes all log files from .build/', () => {
    writeFileSync(join(buildDir, 'plan-abc-2026-03-08T02-31-09-build.log'), 'log1');
    writeFileSync(join(buildDir, 'plan-abc-2026-03-08T03-33-24-build.log'), 'log2');

    const removed = cleanupBuild(buildDir);

    expect(readdirSync(buildDir)).toEqual([]);
    expect(removed).toBe(2);
  });

  it('removes checkpoint files', () => {
    writeFileSync(join(buildDir, 'plan-abc.checkpoint'), 'checkpoint data');

    const removed = cleanupBuild(buildDir);

    expect(existsSync(join(buildDir, 'plan-abc.checkpoint'))).toBe(false);
    expect(removed).toBe(1);
  });

  it('removes traces db', () => {
    writeFileSync(join(buildDir, 'build-traces.db'), 'sqlite data');

    const removed = cleanupBuild(buildDir);

    expect(existsSync(join(buildDir, 'build-traces.db'))).toBe(false);
    expect(removed).toBe(1);
  });

  it('removes all build artifacts at once', () => {
    writeFileSync(join(buildDir, 'plan-abc-2026-03-08T02-31-09-build.log'), 'log');
    writeFileSync(join(buildDir, 'plan-abc.checkpoint'), 'cp');
    writeFileSync(join(buildDir, 'build-traces.db'), 'db');

    const removed = cleanupBuild(buildDir);

    expect(readdirSync(buildDir)).toEqual([]);
    expect(removed).toBe(3);
  });

  it('returns 0 when .build/ is empty', () => {
    const removed = cleanupBuild(buildDir);
    expect(removed).toBe(0);
  });

  it('returns 0 when .build/ does not exist', () => {
    rmSync(buildDir, { recursive: true, force: true });
    const removed = cleanupBuild(buildDir);
    expect(removed).toBe(0);
  });
});
