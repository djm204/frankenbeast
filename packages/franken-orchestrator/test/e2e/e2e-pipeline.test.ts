/**
 * End-to-End Pipeline Test
 *
 * Spawns `frankenbeast` as a subprocess with a minimal design doc
 * and verifies the full pipeline: plan → execute.
 *
 * PREREQUISITES:
 *   - Build the project: cd @franken/orchestrator && npm run build
 *   - Real `claude` CLI installed and on PATH
 *   - Valid ANTHROPIC_API_KEY in environment
 *
 * MANUAL SMOKE TEST:
 *   1. cd /tmp && mkdir fb-smoke && cd fb-smoke && git init
 *   2. git commit --allow-empty -m "init"
 *   3. node <orchestrator>/dist/cli/run.js \
 *        --design-doc <orchestrator>/test/e2e/test-design-doc.md \
 *        --no-pr --budget 2 --base-branch main
 *   4. When prompted for review, type "y" and press Enter
 *   5. Verify output contains [planner] and [martin] labels
 *   6. Verify budget bar shows non-zero spend (e.g., $0.05/$2)
 *   7. Verify no raw JSON frames like {"type":"content_block_delta"}
 *   8. rm -rf /tmp/fb-smoke
 *
 * RUN:
 *   npm run test:e2e --workspace @franken/orchestrator -- test/e2e/e2e-pipeline.test.ts
 */

import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readVitestFlag } from '../../../../scripts/vitest-env.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const hasE2eProviderCredentials = (): boolean => Boolean(
  process.env['ANTHROPIC_API_KEY'] || process.env['OPENAI_API_KEY'],
);

describe.skipIf(!readVitestFlag(process.env, 'E2E') || !hasE2eProviderCredentials())('E2E Pipeline', () => {
  let tmpDir: string;
  const designDoc = resolve(__dirname, 'test-design-doc.md');
  const cliBin = resolve(__dirname, '../../dist/cli/run.js');

  beforeAll(() => {
    if (!existsSync(cliBin)) {
      throw new Error(
        `CLI binary not found at ${cliBin}. Run "npm run build" first.`,
      );
    }
    if (!existsSync(designDoc)) {
      throw new Error(`Test design doc not found at ${designDoc}.`);
    }

    // Create isolated temp git repo
    tmpDir = mkdtempSync(join(tmpdir(), 'frankenbeast-e2e-'));
    execSync('git init', { cwd: tmpDir, stdio: 'ignore' });
    execSync('git config user.email "test@test.com"', {
      cwd: tmpDir,
      stdio: 'ignore',
    });
    execSync('git config user.name "Test"', {
      cwd: tmpDir,
      stdio: 'ignore',
    });
    execSync('git commit --allow-empty -m "init"', {
      cwd: tmpDir,
      stdio: 'ignore',
    });
    // Create the test-e2e branch so --base-branch test-e2e resolves
    execSync('git branch test-e2e', { cwd: tmpDir, stdio: 'ignore' });
  });

  afterAll(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('runs full pipeline: plan → execute', async () => {
    const result = await runFrankenbeast(cliBin, tmpDir, designDoc);

    // If process failed due to API/rate-limit issues, skip gracefully
    if (result.exitCode !== 0 && isApiRelatedFailure(result)) {
      console.warn('E2E test skipped: API/rate-limit issue detected');
      console.warn('stderr:', result.stderr.slice(0, 500));
      return;
    }

    // Verify exit code 0
    expect(result.exitCode).toBe(0);

    // Verify [planner] service label (plan phase ran)
    expect(result.stdout).toContain('[planner]');

    // Verify [martin] service label (execution phase ran)
    expect(result.stdout).toContain('[martin]');

    // Verify budget bar with non-zero spend (e.g., $0.05/$2)
    const budgetMatch = result.stdout.match(/\$(\d+\.\d{2})\/\$(\d+)/);
    expect(budgetMatch).toBeTruthy();
    expect(budgetMatch![1]).not.toBe('0.00');

    // Verify no raw JSON frames in stdout
    expect(result.stdout).not.toContain('{"type":"content_block_delta"');
  }, 300_000); // 5 minute timeout
});

describe('hasE2eProviderCredentials helper', () => {
  const providerEnvKeys = [
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
    'GOOGLE_API_KEY',
    'GEMINI_API_KEY',
  ] as const;

  const withProviderEnv = (
    env: Partial<Record<(typeof providerEnvKeys)[number], string>>,
    run: () => void,
  ) => {
    const previous = Object.fromEntries(
      providerEnvKeys.map((key) => [key, process.env[key]]),
    );

    for (const key of providerEnvKeys) {
      delete process.env[key];
    }
    Object.assign(process.env, env);

    try {
      run();
    } finally {
      for (const key of providerEnvKeys) {
        const value = previous[key];
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  };

  it('accepts credentials used by the default claude/codex e2e invocation', () => {
    withProviderEnv({ ANTHROPIC_API_KEY: 'test-key' }, () => {
      expect(hasE2eProviderCredentials()).toBe(true);
    });

    withProviderEnv({ OPENAI_API_KEY: 'test-key' }, () => {
      expect(hasE2eProviderCredentials()).toBe(true);
    });
  });

  it('does not accept Gemini-only credentials for the default e2e invocation', () => {
    withProviderEnv({ GOOGLE_API_KEY: 'test-key' }, () => {
      expect(hasE2eProviderCredentials()).toBe(false);
    });

    withProviderEnv({ GEMINI_API_KEY: 'test-key' }, () => {
      expect(hasE2eProviderCredentials()).toBe(false);
    });
  });
});

/** Detect API/infra failures that shouldn't count as test failures. */
function hasPipelineBoundary(result: { stdout: string; stderr: string }): boolean {
  const combined = result.stdout + result.stderr;
  return combined.includes('[planner]') || combined.includes('[martin]');
}

function isApiRelatedFailure(result: {
  stdout: string;
  stderr: string;
}): boolean {
  const combined = result.stdout + result.stderr;
  return hasPipelineBoundary(result) &&
    (
      /rate ?limit/i.test(combined) ||
      /rate_limit/i.test(combined) ||
      /\b429\b/.test(combined) ||
      /\b503\b/.test(combined) ||
      /overloaded/i.test(combined) ||
      /usage limit/i.test(combined) ||
      /\b(?:ENOTFOUND|EAI_AGAIN|ECONNRESET|ETIMEDOUT)\b/i.test(combined) ||
      /ANTHROPIC_API_KEY/i.test(combined) ||
      /OPENAI_API_KEY/i.test(combined) ||
      /GOOGLE_API_KEY/i.test(combined) ||
      /GEMINI_API_KEY/i.test(combined) ||
      /Could not connect to (?:Anthropic|OpenAI|Gemini|claude|codex|provider)/i.test(combined)
    );
}

describe('isApiRelatedFailure helper', () => {
  it('returns true for provider errors after planner boundary', () => {
    expect(
      isApiRelatedFailure({
        stdout: '[planner] Rate limit: retry after 30s',
        stderr: '',
      }),
    ).toBe(true);
  });

  it('returns true for provider DNS errors after planner boundary', () => {
    expect(
      isApiRelatedFailure({
        stdout: '[planner] starting generation\n',
        stderr: 'Error: getaddrinfo ENOTFOUND api.anthropic.com\n',
      }),
    ).toBe(true);
  });

  it('returns false when auth-like text appears before planner', () => {
    expect(
      isApiRelatedFailure({
        stdout: 'authentication required for git access\n',
        stderr: '',
      }),
    ).toBe(false);
  });

  it('returns false for auth-like provider signals before pipeline starts', () => {
    expect(
      isApiRelatedFailure({
        stdout: 'Could not connect to provider metadata service\n',
        stderr: '',
      }),
    ).toBe(false);
  });

  it('returns false when rate limiting occurs before planner starts', () => {
    expect(
      isApiRelatedFailure({
        stdout: 'status 429 from bootstrap service\n',
        stderr: '',
      }),
    ).toBe(false);
  });
});

/** Spawn frankenbeast CLI as a subprocess, piping "y" for review approval. */
function runFrankenbeast(
  bin: string,
  cwd: string,
  designDocPath: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    // Clear CLAUDE* env vars to avoid inheriting parent session state
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (!k.startsWith('CLAUDE') && v !== undefined) {
        env[k] = v;
      }
    }

    const proc = spawn(
      'node',
      [
        bin,
        '--design-doc',
        designDocPath,
        '--no-pr',
        '--budget',
        '2',
        '--base-branch',
        'test-e2e',
      ],
      { cwd, env },
    );

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });
    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    // Pipe "y" for review loop approvals (plan phase)
    proc.stdin.write('y\ny\ny\n');
    proc.stdin.end();

    proc.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });
  });
}
