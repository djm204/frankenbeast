import { existsSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

import { isDirectRun, runWithTempCleanup } from '../../scripts/publish-smoke.mjs';

describe('publish smoke temp cleanup', () => {
  it('recognizes symlinked script invocations as direct runs', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'fbeast-entrypoint-test-'));
    const realScript = join(tempDir, 'publish-smoke.mjs');
    const symlinkedScript = join(tempDir, 'publish-smoke-link.mjs');
    writeFileSync(realScript, 'fixture');
    symlinkSync(realScript, symlinkedScript);

    try {
      expect(isDirectRun(pathToFileURL(realScript).href, symlinkedScript)).toBe(true);
      expect(isDirectRun(pathToFileURL(realScript).href, '')).toBe(false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('removes created pack and install directories when a mid-script failure throws', () => {
    const stage = mkdtempSync(join(tmpdir(), 'fbeast-pack-'));
    const proj = mkdtempSync(join(tmpdir(), 'fbeast-install-'));
    writeFileSync(join(stage, 'package.tgz'), 'fixture');
    writeFileSync(join(proj, 'package.json'), JSON.stringify({ name: 'smoke', private: true }));

    expect(() => runWithTempCleanup(
      () => [stage, proj],
      () => {
        throw new Error('simulated publish-smoke failure');
      },
    )).toThrow('simulated publish-smoke failure');

    expect(existsSync(stage)).toBe(false);
    expect(existsSync(proj)).toBe(false);
  });
});
