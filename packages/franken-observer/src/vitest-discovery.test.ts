import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function runObserverVitestWithNoMatches(env: NodeJS.ProcessEnv = {}) {
  return spawnSync(
    'npm',
    ['exec', '--', 'vitest', 'run', '--config', 'vitest.config.ts', 'src/__empty__/**/*.test.ts'],
    {
      cwd: packageRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        CI: '1',
        INTEGRATION: undefined,
        EVAL: undefined,
        ...env,
      },
    },
  );
}

function runObserverPackageScript(script: string) {
  return spawnSync('npm', ['run', script], {
    cwd: packageRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      CI: '1',
      INTEGRATION: undefined,
      EVAL: undefined,
    },
  });
}

describe('observer Vitest discovery', () => {
  it('does not mask empty default unit test discovery', () => {
    const config = readFileSync(resolve(packageRoot, 'vitest.config.ts'), 'utf8');

    expect(config).not.toContain('passWithNoTests');

    const result = runObserverVitestWithNoMatches();

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/No test files found|No test files matched/u);
  });

  it('does not mask empty integration or eval discovery', () => {
    for (const env of [{ INTEGRATION: 'true' }, { EVAL: 'true' }]) {
      const result = runObserverVitestWithNoMatches(env);

      expect(result.status).not.toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toMatch(/No test files found|No test files matched/u);
    }
  });

  it('runs the advertised observer eval suite instead of a zero-test placeholder', () => {
    const result = runObserverPackageScript('test:eval');
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status, output).toBe(0);
    expect(output).toMatch(/src\/evals\/.+\.test\.ts/u);
    expect(output).toMatch(/Test Files[\s\S]*[1-9]\d*\s+passed/u);
  });
});
