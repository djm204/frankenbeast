import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

type VitestConfig = {
  test?: {
    include?: string[];
    exclude?: string[];
  };
};

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const discoverySmokeTimeoutMs = 20_000;

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

describe('observer Vitest discovery', () => {
  it('does not mask empty default unit test discovery', () => {
    const config = readFileSync(resolve(packageRoot, 'vitest.config.ts'), 'utf8');

    expect(config).not.toContain('passWithNoTests');

    const result = runObserverVitestWithNoMatches();

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/No test files found|No test files matched/u);
  }, discoverySmokeTimeoutMs);

  it('does not mask empty integration or eval discovery', () => {
    for (const env of [{ INTEGRATION: 'true' }, { EVAL: 'true' }]) {
      const result = runObserverVitestWithNoMatches(env);

      expect(result.status).not.toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toMatch(/No test files found|No test files matched/u);
    }
  }, discoverySmokeTimeoutMs);

  it('treats false-like suite flags as default unit test selection', async () => {
    const originalEnv = {
      INTEGRATION: process.env['INTEGRATION'],
      EVAL: process.env['EVAL'],
    };

    try {
      for (const env of [{ INTEGRATION: 'false' }, { INTEGRATION: '0' }, { EVAL: 'false' }]) {
        vi.resetModules();
        for (const name of ['INTEGRATION', 'EVAL'] as const) {
          const value = env[name];
          if (value === undefined) {
            delete process.env[name];
          } else {
            process.env[name] = value;
          }
        }

        const module = await import('../vitest.config.ts');
        const config = module.default as VitestConfig;

        expect(config.test?.include).toEqual(['src/**/*.test.ts']);
        expect(config.test?.exclude).toEqual([
          'src/**/*.integration.test.ts',
          'src/**/*.eval.test.ts',
          'src/evals/**/*.test.ts',
        ]);
      }
    } finally {
      for (const [name, value] of Object.entries(originalEnv)) {
        if (value === undefined) {
          delete process.env[name];
        } else {
          process.env[name] = value;
        }
      }
      vi.resetModules();
    }
  });

  it('excludes eval-only tests from the default unit suite', async () => {
    const originalEval = process.env['EVAL'];
    const originalIntegration = process.env['INTEGRATION'];

    try {
      delete process.env['EVAL'];
      delete process.env['INTEGRATION'];
      vi.resetModules();

      const module = await import('../vitest.config.ts');
      const config = module.default as VitestConfig;

      expect(config.test?.include).toEqual(['src/**/*.test.ts']);
      expect(config.test?.exclude).toContain('src/evals/**/*.test.ts');
    } finally {
      if (originalEval === undefined) {
        delete process.env['EVAL'];
      } else {
        process.env['EVAL'] = originalEval;
      }
      if (originalIntegration === undefined) {
        delete process.env['INTEGRATION'];
      } else {
        process.env['INTEGRATION'] = originalIntegration;
      }
      vi.resetModules();
    }
  });

  it('points eval mode at the committed observer eval suite', async () => {
    const originalEval = process.env['EVAL'];
    const originalIntegration = process.env['INTEGRATION'];

    try {
      process.env['EVAL'] = 'true';
      delete process.env['INTEGRATION'];
      vi.resetModules();

      const module = await import('../vitest.config.ts');
      const config = module.default as VitestConfig;

      expect(config.test?.include).toEqual(['src/evals/**/*.test.ts', 'src/**/*.eval.test.ts']);
      expect(config.test?.exclude).toEqual([]);
    } finally {
      if (originalEval === undefined) {
        delete process.env['EVAL'];
      } else {
        process.env['EVAL'] = originalEval;
      }
      if (originalIntegration === undefined) {
        delete process.env['INTEGRATION'];
      } else {
        process.env['INTEGRATION'] = originalIntegration;
      }
      vi.resetModules();
    }
  });
});
