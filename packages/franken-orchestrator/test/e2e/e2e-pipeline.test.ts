/**
 * End-to-End Pipeline Test
 *
 * Spawns `frankenbeast` as a subprocess with a minimal design doc
 * and verifies the full pipeline: plan → execute.
 *
 * PREREQUISITES:
 *   - Build the project: cd franken-orchestrator && npm run build
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
 *   E2E=true npx vitest run test/e2e/e2e-pipeline.test.ts
 */

import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe.skipIf(!process.env['E2E'])('E2E Pipeline', () => {
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

/** Detect API/infra failures that shouldn't count as test failures. */
function isApiRelatedFailure(result: {
  stdout: string;
  stderr: string;
}): boolean {
  const combined = result.stdout + result.stderr;
  return (
    combined.includes('rate limit') ||
    combined.includes('rate_limit') ||
    combined.includes('overloaded') ||
    combined.includes('ENOTFOUND') ||
    combined.includes('429') ||
    combined.includes('503') ||
    combined.includes('ANTHROPIC_API_KEY') ||
    combined.includes('authentication') ||
    combined.includes('Could not connect')
  );
}

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
