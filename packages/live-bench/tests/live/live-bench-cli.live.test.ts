import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const packageRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const cliEntrypoint = join(packageRoot, 'dist', 'cli', 'main.js');
const corpusRoot = join(packageRoot, 'corpus');
const runLiveBenchE2e = process.env.FBEAST_LIVE_BENCH_E2E === '1';

describe.skipIf(!runLiveBenchE2e)('live-bench package live target', () => {
  it('executes the built package CLI against the checked-in corpus', () => {
    expect(existsSync(cliEntrypoint), `${cliEntrypoint} should exist; npm run test:live builds before running live tests`).toBe(true);

    const result = spawnSync(process.execPath, [cliEntrypoint, 'list', corpusRoot], {
      cwd: packageRoot,
      encoding: 'utf8',
      timeout: 10_000,
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.split(/\r?\n/)).toContain('write-readme');
  });
});
