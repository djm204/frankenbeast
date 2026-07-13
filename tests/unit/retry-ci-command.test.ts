import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..', '..');
const SCRIPT = resolve(ROOT, 'scripts/retry-ci-command.mjs');

function runRetryCommand(args: string[], env: Record<string, string> = {}) {
  return spawnSync(process.execPath, [SCRIPT, '--', ...args], {
    cwd: ROOT,
    env: { ...process.env, CI_TEST_RETRIES: '', ...env },
    encoding: 'utf8',
  });
}

describe('CI retry command wrapper', () => {
  it('retries a failing command until it succeeds and logs retry attempts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'franken-ci-retry-'));
    const counter = join(dir, 'counter.txt');
    const childScript = `
const { existsSync, readFileSync, writeFileSync } = require('node:fs');
const file = process.argv[1];
const count = existsSync(file) ? Number(readFileSync(file, 'utf8')) + 1 : 1;
writeFileSync(file, String(count));
process.exit(count < 2 ? 7 : 0);
`;

    try {
      const result = runRetryCommand([process.execPath, '-e', childScript, counter], { CI_TEST_RETRIES: '2' });

      expect(result.status).toBe(0);
      expect(readFileSync(counter, 'utf8')).toBe('2');
      expect(result.stderr).toContain('[ci-retry] attempt 1/3');
      expect(result.stderr).toContain('[ci-retry] command failed with exit code 7; retrying');
      expect(result.stderr).toContain('[ci-retry] command succeeded on retry attempt 2');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }

    expect(existsSync(dir)).toBe(false);
  });

  it('preserves the final failure exit code after retries are exhausted', () => {
    const result = runRetryCommand([process.execPath, '-e', 'process.exit(9)'], { CI_TEST_RETRIES: '1' });

    expect(result.status).toBe(9);
    expect(result.stderr).toContain('[ci-retry] attempt 1/2');
    expect(result.stderr).toContain('[ci-retry] attempt 2/2');
    expect(result.stderr).toContain('[ci-retry] command failed after 2 attempt(s)');
  });

  it('fails fast when the retry count is not a non-negative integer', () => {
    const result = runRetryCommand([process.execPath, '-e', 'process.exit(0)'], { CI_TEST_RETRIES: '1.5' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('CI_TEST_RETRIES must be a non-negative integer');
  });
});
