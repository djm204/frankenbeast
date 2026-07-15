import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { constants as osConstants } from 'node:os';
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

function parseEnvelopes(stderr: string) {
  return stderr
    .split('\n')
    .filter((entry) => entry.trim().startsWith('{') && entry.includes('franken.cron.script.error'))
    .map((entry) => JSON.parse(entry));
}

function parseEnvelope(stderr: string) {
  const envelopes = parseEnvelopes(stderr);
  expect(envelopes, `stderr should include a structured JSON envelope: ${stderr}`).toHaveLength(1);
  return envelopes[0];
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

  it('redacts secret-looking argv before emitting envelopes', () => {
    const result = runCronScript([
      '--name',
      'secret-job',
      '--',
      process.execPath,
      '-e',
      'process.exit(3)',
      '--',
      '--token',
      'super-secret-token',
      '--api-key=abc123',
    ]);

    expect(result.status).toBe(3);
    const envelope = parseEnvelope(result.stderr);
    expect(envelope.command).toContain('[REDACTED]');
    expect(envelope.command).toContain('--api-key=[REDACTED]');
    expect(JSON.stringify(envelope.command)).not.toContain('super-secret-token');
    expect(JSON.stringify(envelope.command)).not.toContain('abc123');
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

  it('keeps the envelope parseable when stderr lacks a trailing newline', () => {
    const result = runCronScript([
      '--name',
      'unterminated-stderr',
      '--',
      process.execPath,
      '-e',
      "process.stderr.write('unterminated'); process.exit(9)",
    ]);

    expect(result.status).toBe(9);
    expect(result.stderr).toContain('unterminated\n{');
    const envelope = parseEnvelope(result.stderr);
    expect(envelope).toMatchObject({
      script: 'unterminated-stderr',
      failureKind: 'exit',
      exitCode: 9,
    });
  });

  it('keeps the envelope parseable when progress stderr ends with a carriage return', () => {
    const result = runCronScript([
      '--name',
      'progress-stderr',
      '--',
      process.execPath,
      '-e',
      "process.stderr.write('progress\\r'); process.exit(9)",
    ]);

    expect(result.status).toBe(9);
    expect(result.stderr).toContain('progress\r\n{');
    const envelope = parseEnvelope(result.stderr);
    expect(envelope).toMatchObject({
      script: 'progress-stderr',
      failureKind: 'exit',
      exitCode: 9,
    });
  });

  it('emits one spawn envelope when the child command cannot start', () => {
    const result = runCronScript(['--name', 'bad-binary', '--', 'definitely-not-a-real-command-frankenbeast']);

    expect(result.status).toBe(127);
    const envelope = parseEnvelope(result.stderr);
    expect(envelope).toMatchObject({
      script: 'bad-binary',
      failureKind: 'spawn',
      exitCode: 127,
    });
  });

  it('preserves the job name on option parse errors', () => {
    const result = runCronScript(['--name', 'nightly', '--recvoerable', '--', process.execPath, '-e', 'process.exit(0)']);

    expect(result.status).toBe(2);
    const envelope = parseEnvelope(result.stderr);
    expect(envelope).toMatchObject({
      script: 'nightly',
      failureKind: 'usage',
      exitCode: 2,
    });
  });

  it('forwards parent termination signals to the child and reports signal-specific status', async () => {
    const child = spawn(process.execPath, [
      SCRIPT,
      '--name',
      'signal-test',
      '--',
      process.execPath,
      '-e',
      "process.on('SIGTERM', () => { process.stderr.write('cleanup after signal'); process.exit(0); }); process.stderr.write('ready for signal\\n'); setInterval(() => {}, 1000)",
    ], {
      cwd: ROOT,
      env: { ...process.env, TZ: 'UTC', CRON_SCRIPT_KILL_GRACE_MS: '50' },
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    await new Promise<void>((resolve) => {
      child.stderr.on('data', () => {
        if (stderr.includes('ready for signal')) {
          resolve();
        }
      });
    });
    child.kill('SIGTERM');

    const status = await new Promise<number | null>((resolve) => {
      child.on('close', (code) => resolve(code));
    });

    expect(status).toBe(128 + osConstants.signals.SIGTERM);
    const envelope = parseEnvelope(stderr);
    expect(envelope).toMatchObject({
      script: 'signal-test',
      failureKind: 'signal',
      signal: 'SIGTERM',
      exitCode: 128 + osConstants.signals.SIGTERM,
    });
    expect(envelope.stderrTail).toContain('cleanup after signal');
  });

  it('emits a signal envelope before force-finishing when the child ignores termination', async () => {
    const child = spawn(process.execPath, [
      SCRIPT,
      '--name',
      'force-kill-signal-test',
      '--',
      process.execPath,
      '-e',
      "process.on('SIGTERM', () => { process.stderr.write('ignoring signal'); }); process.stderr.write('ready for signal\\n'); setInterval(() => {}, 1000)",
    ], {
      cwd: ROOT,
      env: { ...process.env, TZ: 'UTC', CRON_SCRIPT_KILL_GRACE_MS: '50' },
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    await new Promise<void>((resolve) => {
      child.stderr.on('data', () => {
        if (stderr.includes('ready for signal')) {
          resolve();
        }
      });
    });
    child.kill('SIGTERM');

    const status = await new Promise<number | null>((resolve) => {
      child.on('close', (code) => resolve(code));
    });

    expect(status).toBe(128 + osConstants.signals.SIGTERM);
    const envelope = parseEnvelope(stderr);
    expect(envelope).toMatchObject({
      script: 'force-kill-signal-test',
      failureKind: 'signal',
      signal: 'SIGTERM',
      exitCode: 128 + osConstants.signals.SIGTERM,
    });
    expect(envelope.stderrTail).toContain('ignoring signal');
  });

  it('documents the envelope schema for operators and liveness tooling', () => {
    const doc = readFileSync(DOC, 'utf8');

    expect(doc).toContain('scripts/run-cron-script.mjs');
    expect(doc).toContain('franken.cron.script.error');
    expect(doc).toContain('failureKind');
    expect(doc).toContain('stderrTail');
  });
});
