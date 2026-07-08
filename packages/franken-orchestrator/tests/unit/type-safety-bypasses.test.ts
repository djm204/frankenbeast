import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(testDir, '..', '..');

function readSource(relativePath: string): string {
  return readFileSync(join(packageRoot, relativePath), 'utf8');
}

describe('orchestrator type-safety bypass cleanup', () => {
  it('does not use unsafe any casts in the issue #639 production files', () => {
    const files = [
      'src/phases/closure.ts',
      'src/network/secret-backends/cli-runner.ts',
      'src/comms/channels/whatsapp/whatsapp-router.ts',
    ];

    for (const file of files) {
      expect(readSource(file), file).not.toMatch(/\bas\s+any\b|:\s*any\b/);
    }
  });
});
