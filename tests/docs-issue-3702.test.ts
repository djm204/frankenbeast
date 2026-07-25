import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');

describe('issue #3702 hive status query documentation', () => {
  it('keeps the public surface and architecture docs synchronized', () => {
    expect(read('packages/franken-orchestrator/src/index.ts')).toContain(
      "from './beasts/services/hive-status-query.js';",
    );
    for (const path of [
      'docs/ARCHITECTURE.md',
      'docs/onboarding/RAMP_UP.md',
      'packages/franken-orchestrator/README.md',
      'docs/adr/041-hive-brain-command-center.md',
    ]) {
      const content = read(path);
      expect(content, `${path} must describe the shipped query`).toContain('HiveStatusQuery');
      expect(content, `${path} must preserve the dispatch boundary`).toMatch(/does not|without changing|read-only/i);
    }
  });
});
