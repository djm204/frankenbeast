import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { cleanupBuild } from '../../../src/cli/cleanup.js';

describe('cleanupBuild', () => {
  it('removes nested chunk session directories', () => {
    const root = mkdtempSync(join(tmpdir(), 'cleanup-'));
    const nested = join(root, 'chunk-sessions', 'demo-plan');
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(nested, '01_demo.json'), '{}');

    const removed = cleanupBuild(root);

    expect(removed).toBeGreaterThan(0);
    expect(existsSync(nested)).toBe(false);

    rmSync(root, { recursive: true, force: true });
  });

  it('unlinks symlink entries without traversing their targets', () => {
    const root = mkdtempSync(join(tmpdir(), 'cleanup-'));
    const outside = mkdtempSync(join(tmpdir(), 'cleanup-outside-'));
    const outsideFile = join(outside, 'keep.log');
    writeFileSync(outsideFile, 'outside artifact');
    symlinkSync(outside, join(root, 'linked-artifacts'), 'dir');

    try {
      const removed = cleanupBuild(root);

      expect(removed).toBe(1);
      expect(existsSync(join(root, 'linked-artifacts'))).toBe(false);
      expect(readFileSync(outsideFile, 'utf8')).toBe('outside artifact');
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('refuses symlinked cleanup roots without an explicit override', () => {
    const linkParent = mkdtempSync(join(tmpdir(), 'cleanup-link-parent-'));
    const outside = mkdtempSync(join(tmpdir(), 'cleanup-outside-'));
    const linkRoot = join(linkParent, '.build');
    const outsideFile = join(outside, 'keep.log');
    writeFileSync(outsideFile, 'outside artifact');
    symlinkSync(outside, linkRoot, 'dir');

    try {
      expect(() => cleanupBuild(linkRoot)).toThrow(/Refusing to clean build directory with symlinked path component/i);
      expect(readFileSync(outsideFile, 'utf8')).toBe('outside artifact');
    } finally {
      rmSync(linkParent, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('refuses symlinked cleanup ancestors without an explicit override', () => {
    const linkParent = mkdtempSync(join(tmpdir(), 'cleanup-link-parent-'));
    const outside = mkdtempSync(join(tmpdir(), 'cleanup-outside-'));
    const realBuild = join(outside, '.build');
    const linkAncestor = join(linkParent, '.fbeast');
    const linkRoot = join(linkAncestor, '.build');
    const outsideFile = join(realBuild, 'keep.log');
    mkdirSync(realBuild, { recursive: true });
    writeFileSync(outsideFile, 'outside artifact');
    symlinkSync(outside, linkAncestor, 'dir');

    try {
      expect(() => cleanupBuild(linkRoot)).toThrow(/Refusing to clean build directory with symlinked path component/i);
      expect(readFileSync(outsideFile, 'utf8')).toBe('outside artifact');
    } finally {
      rmSync(linkParent, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
