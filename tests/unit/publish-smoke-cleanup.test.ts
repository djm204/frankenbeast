import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { runWithTempCleanup } from '../../scripts/publish-smoke.mjs';

describe('publish smoke temp cleanup', () => {
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
