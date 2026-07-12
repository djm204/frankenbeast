import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const TYPES_VITEST_CONFIG = resolve(ROOT, 'packages/franken-types/vitest.config.ts');

describe('@franken/types Vitest zero-test handling', () => {
  it('does not opt the package test suite into passing when no tests are discovered', () => {
    const configSource = readFileSync(TYPES_VITEST_CONFIG, 'utf8');

    expect(configSource).not.toMatch(/passWithNoTests\s*:\s*true/u);
  });

  it('fails the package test command when a requested test pattern matches no files', () => {
    const tmpDir = resolve(ROOT, '.tmp/vitest-franken-types-zero-test-mask');
    mkdirSync(tmpDir, { recursive: true });

    const result = spawnSync('npm', ['test', '--workspace', '@franken/types', '--', 'no-such/**/*.test.ts'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        TMPDIR: tmpDir,
        XDG_CACHE_HOME: resolve(tmpDir, 'cache'),
      },
    });
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;

    expect(result.status, output).not.toBe(0);
    expect(output).toContain('No test files found');
  });
});
