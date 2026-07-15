import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..', '..');
const SCRIPT = resolve(ROOT, 'scripts/run-cron-script.mjs');
const DOC = resolve(ROOT, 'docs/cron-script-error-envelopes.md');

function runCronScript(args: string[]) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: ROOT,
    env: { ...process.env, TZ: 'UTC' },
    encoding: 'utf8',
  });
}

function parseEnvelope(stderr: string) {
  const line = stderr
    .split('\n')
    .find((entry) => entry.trim().startsWith('{') && entry.includes('franken.cron.script.error'));
  expect(line, `stderr should include a structured JSON envelope: ${stderr}`).toBeDefined();
  return JSON.parse(line!);
}

describe('cron script error envelope runner', () => {
  it('emits a structured JSON error envelope when a cron command exits non-zero', () => {
    const result = runCronScript([
      '--name',
      'nightly-dr-check',
      '--',
      process.execPath,
      '-e',
      "console.error('database unavailable'); process.exit(7)",
    ]);

    expect(result.status).toBe(7);
    const envelope = parseEnvelope(result.stderr);
    expect(envelope).toMatchObject({
      schemaVersion: 1,
      type: 'franken.cron.script.error',
      script: 'nightly-dr-check',
      exitCode: 7,
      signal: null,
      recoverable: false,
    });
    expect(envelope.command).toEqual([process.execPath, '-e', "console.error('database unavailable'); process.exit(7)"]);
    expect(envelope.stderrTail).toContain('database unavailable');
    expect(envelope.durationMs).toEqual(expect.any(Number));
    expect(envelope.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('fails with an explicit envelope when the cron command is missing', () => {
    const result = runCronScript(['--name', 'missing-command']);

    expect(result.status).toBe(2);
    const envelope = parseEnvelope(result.stderr);
    expect(envelope).toMatchObject({
      schemaVersion: 1,
      type: 'franken.cron.script.error',
      script: 'missing-command',
      exitCode: 2,
      signal: null,
      failureKind: 'usage',
    });
    expect(envelope.message).toContain('Usage: node scripts/run-cron-script.mjs --name <job-name> -- <command> [args...]');
  });

  it('documents the envelope schema for operators and liveness tooling', () => {
    const doc = readFileSync(DOC, 'utf8');

    expect(doc).toContain('scripts/run-cron-script.mjs');
    expect(doc).toContain('franken.cron.script.error');
    expect(doc).toContain('failureKind');
    expect(doc).toContain('stderrTail');
  });
});
