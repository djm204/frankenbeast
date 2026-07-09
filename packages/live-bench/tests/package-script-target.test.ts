import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function collectTestFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      return collectTestFiles(fullPath);
    }
    return /\.(?:test|spec)\.[cm]?tsx?$/.test(entry.name) ? [fullPath] : [];
  });
}

describe('live test script target', () => {
  it('points at an existing directory with a checked-in live test', () => {
    const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const testLiveScript = packageJson.scripts?.['test:live'] ?? '';
    const match = /vitest\s+run\s+(\S+)/.exec(testLiveScript);

    expect(match?.[1]).toBe('tests/live');

    const liveTarget = join(packageRoot, match?.[1] ?? '');
    expect(existsSync(liveTarget)).toBe(true);
    expect(collectTestFiles(liveTarget).some((file) => file.endsWith('.live.test.ts'))).toBe(true);
  });
});
