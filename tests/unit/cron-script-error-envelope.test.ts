import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { constants as osConstants, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..', '..');
const SCRIPT = resolve(ROOT, 'scripts/run-cron-script.mjs');
const DOC = resolve(ROOT, 'docs/cron-script-error-envelopes.md');

function runCronScript(args: string[]) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: ROOT,
    env: { ...process.env, TZ: 'UTC' },
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
}

function runCronScriptWithEnv(args: string[], env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: ROOT,
    env: { ...process.env, TZ: 'UTC', ...env },
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
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
      "process.stderr.write('API_KEY=stderr-value QUOTED_TOKEN=\\\"quoted-value\\\" SPACED_TOKEN=\\\"top secret\\\" token=\\'single quoted value\\' AUTHORIZATION=Bearer bearer-value PASSWORD=top secret; {\\\"password\\\":\\\"json-value\\\"} {\\\"access_token\\\":\\\"json-token-value\\\"} Authorization: Basic *** Authorization: Bearer *** https://***@github.com/org/repo.git'); process.exit(3)",
      '--',
      '--token',
      'super-secret-token',
      '--api-key=abc123',
      '--authorization',
      'Bearer',
      'split-bearer-token',
      '--private-key',
      'inline-private-key',
      '--private-key=inline-private-key-equals',
      'postgres://user:***@localhost:5432/db',
      'https://***@github.com/org/repo.git',
    ]);

    expect(result.status).toBe(3);
    const envelope = parseEnvelope(result.stderr);
    expect(envelope.command).toContain('[REDACTED]');
    expect(envelope.command).toContain('--api-key=[REDACTED]');
    expect(envelope.command).not.toContain('Bearer');
    expect(envelope.command).not.toContain('split-bearer-token');
    expect(envelope.command).not.toContain('inline-private-key');
    expect(envelope.command).toContain('--private-key=[REDACTED]');
    expect(envelope.command).toContain('postgres://[REDACTED]:[REDACTED]@localhost:5432/db');
    expect(envelope.command).toContain('https://[REDACTED]@github.com/org/repo.git');
    expect(envelope.stderrTail).toContain('API_KEY=[REDACTED]');
    expect(envelope.stderrTail).toContain('QUOTED_TOKEN="[REDACTED]"');
    expect(envelope.stderrTail).toContain('SPACED_TOKEN="[REDACTED]"');
    expect(envelope.stderrTail).toContain("token='[REDACTED]'");
    expect(envelope.stderrTail).toContain('PASSWORD=[REDACTED]');
    expect(envelope.stderrTail).toContain('AUTHORIZATION=[REDACTED]');
    expect(envelope.stderrTail).toContain('PASSWORD=[REDACTED]');
    expect(JSON.stringify(envelope)).not.toContain('super-secret-token');
    expect(JSON.stringify(envelope)).not.toContain('abc123');
    expect(JSON.stringify(envelope)).not.toContain('db-password');
    expect(JSON.stringify(envelope)).not.toContain('stderr-secret');
    expect(JSON.stringify(envelope)).not.toContain('stderr-token');
    expect(JSON.stringify(envelope)).not.toContain('quoted-value');
    expect(JSON.stringify(envelope)).not.toContain('top secret');
    expect(JSON.stringify(envelope)).not.toContain('single quoted value');
    expect(JSON.stringify(envelope)).not.toContain('json-value');
    expect(JSON.stringify(envelope)).not.toContain('json-token-value');
    expect(JSON.stringify(envelope)).not.toContain('basic-value');
    expect(JSON.stringify(envelope)).not.toContain('bearer-value');
    expect(JSON.stringify(envelope)).not.toContain('deploytoken');
    expect(JSON.stringify(envelope)).not.toContain('commandtoken');
    expect(JSON.stringify(envelope)).not.toContain('split-bearer-token');
    expect(JSON.stringify(envelope)).not.toContain('inline-private-key');
    expect(JSON.stringify(envelope)).not.toContain('json-value');
    expect(JSON.stringify(envelope)).not.toContain('json-token-value');
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

  it('scrubs secret-looking spawn failure messages before logging envelopes', () => {
    const result = runCronScript(['--name', 'bad-secret-binary', '--', 'API_KEY=abc123', 'job.js']);

    expect(result.status).toBe(127);
    const envelope = parseEnvelope(result.stderr);
    expect(envelope.command).toEqual(['API_KEY=[REDACTED]', 'job.js']);
    expect(envelope.message).toContain('API_KEY=[REDACTED]');
    expect(envelope.message).not.toContain('abc123');
    expect(result.stderr).not.toContain('API_KEY=abc123');
  });

  it('uses shell-compatible 126 for permission-denied spawn failures', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'franken-cron-permission-'));
    const blockedCommand = join(tempDir, 'blocked-command');

    try {
      writeFileSync(blockedCommand, '#!/bin/sh\nexit 0\n');
      chmodSync(blockedCommand, 0o644);

      const result = runCronScript(['--name', 'permission-denied-command', '--', blockedCommand]);

      expect(result.status).toBe(126);
      const envelope = parseEnvelope(result.stderr);
      expect(envelope).toMatchObject({
        script: 'permission-denied-command',
        failureKind: 'spawn',
        exitCode: 126,
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('reports child exit promptly even when a background helper keeps stderr open', () => {
    const result = runCronScript([
      '--name',
      'inherited-stderr-helper',
      '--',
      process.execPath,
      '-e',
      "require('node:child_process').spawn(process.execPath, ['-e', 'setTimeout(() => {}, 5000)'], { detached: true, stdio: ['ignore', 'ignore', 'inherit'] }).unref(); process.exit(7)",
    ]);

    expect(result.status).toBe(7);
    const envelope = parseEnvelope(result.stderr);
    expect(envelope).toMatchObject({
      script: 'inherited-stderr-helper',
      failureKind: 'exit',
      exitCode: 7,
    });
    expect(envelope.durationMs).toBeLessThan(1_500);
  });

  it('preserves the final stderr tail when large stderr bursts hit backpressure', () => {
    const result = runCronScriptWithEnv([
      '--name',
      'large-stderr-tail',
      '--',
      process.execPath,
      '-e',
      "const fs = require('node:fs'); fs.writeSync(2, 'x'.repeat(2 * 1024 * 1024)); fs.writeSync(2, 'FINAL-TAIL-MARKER'); process.exit(12)",
    ], { CRON_SCRIPT_EXIT_STDERR_DRAIN_MS: '2000' });

    expect(result.status).toBe(12);
    const envelope = parseEnvelope(result.stderr);
    expect(envelope.stderrTail).toContain('FINAL-TAIL-MARKER');
  });

  it('redacts secret values before truncating the stderr tail', () => {
    const leakedSuffix = 'secret-tail-fragment';
    const pem = `-----BEGIN ${'PRIVATE KEY'}-----\nline-one-secret\nline-two-secret\n-----END ${'PRIVATE KEY'}-----`;
    const result = runCronScriptWithEnv([
      '--name',
      'large-secret-stderr-tail',
      '--',
      process.execPath,
      '-e',
      `process.stderr.write('API_KEY=${'x'.repeat(8192)}${leakedSuffix}'); process.stderr.write('\\nPRIVATE_KEY=' + ${JSON.stringify(pem)}); process.exit(13)`,
    ], { CRON_SCRIPT_EXIT_STDERR_DRAIN_MS: '2000' });

    expect(result.status).toBe(13);
    const envelope = parseEnvelope(result.stderr);
    expect(JSON.stringify(envelope)).not.toContain(leakedSuffix);
    expect(JSON.stringify(envelope)).not.toContain('line-one');
    expect(JSON.stringify(envelope)).not.toContain('line-two');
    expect(envelope.stderrTail).toContain('API_KEY=[REDACTED]');
  });

  it('preserves buffered stderr for successful cron runs', () => {
    const result = runCronScriptWithEnv([
      '--name',
      'successful-large-stderr',
      '--',
      process.execPath,
      '-e',
      "const fs = require('node:fs'); fs.writeSync(2, 'successful-stderr-'.repeat(8192)); fs.writeSync(2, 'SUCCESS-FINAL-TAIL'); process.exit(0)",
    ], { CRON_SCRIPT_EXIT_STDERR_DRAIN_MS: '2000' });

    expect(result.status).toBe(0);
    expect(result.stderr).toContain('SUCCESS-FINAL-TAIL');
  });

  it('does not keep successful cron runs alive for the full stderr drain window', () => {
    const started = Date.now();
    const result = runCronScriptWithEnv([
      '--name',
      'quick-success',
      '--',
      process.execPath,
      '-e',
      "require('node:child_process').spawn(process.execPath, ['-e', 'setTimeout(() => {}, 5000)'], { detached: true, stdio: ['ignore', 'ignore', 'inherit'] }).unref(); process.exit(0)",
    ], { CRON_SCRIPT_EXIT_STDERR_DRAIN_MS: '5000' });

    expect(result.status).toBe(0);
    expect(Date.now() - started).toBeLessThan(1_500);
  });

  it('keeps the cron child in the supervisor kill group', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'franken-cron-supervisor-'));
    const pidFile = join(tempDir, 'child.pid');
    try {
      const supervisor = spawn(process.execPath, [
        SCRIPT,
        '--name',
        'supervisor-kill-group',
        '--',
        process.execPath,
        '-e',
        `require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);`,
      ], {
        cwd: ROOT,
        detached: true,
        env: { ...process.env, TZ: 'UTC', CRON_SCRIPT_KILL_GRACE_MS: '50' },
        stdio: ['ignore', 'ignore', 'ignore'],
      });

      await new Promise<void>((resolve) => {
        const started = Date.now();
        const poll = () => {
          try {
            readFileSync(pidFile, 'utf8');
            resolve();
          } catch {
            if (Date.now() - started > 1_000) {
              resolve();
              return;
            }
            setTimeout(poll, 20);
          }
        };
        poll();
      });

      expect(readFileSync(pidFile, 'utf8')).toMatch(/^\d+$/);
      const childPid = Number.parseInt(readFileSync(pidFile, 'utf8'), 10);
      process.kill(-supervisor.pid!, 'SIGTERM');
      await new Promise((resolve) => supervisor.on('close', resolve));
      await new Promise((resolve) => setTimeout(resolve, 100));

      let childAlive = true;
      try {
        process.kill(childPid, 0);
        try {
          childAlive = readFileSync(`/proc/${childPid}/stat`, 'utf8').split(' ')[2] !== 'Z';
        } catch {
          childAlive = true;
        }
      } catch (error) {
        const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code) : '';
        childAlive = code !== 'ESRCH';
      }
      if (childAlive) {
        process.kill(childPid, 'SIGKILL');
      }
      expect(childAlive).toBe(false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('terminates descendants when the wrapper receives a parent signal', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'franken-cron-descendant-'));
    const pidFile = join(tempDir, 'helper.pid');

    try {
      const child = spawn(process.execPath, [
        SCRIPT,
        '--name',
        'descendant-signal-test',
        '--',
        process.execPath,
        '-e',
        `const { spawn } = require('node:child_process'); const helper = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: ['ignore', 'ignore', 'ignore'] }); require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(helper.pid)); process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);`,
      ], {
        cwd: ROOT,
        env: { ...process.env, TZ: 'UTC', CRON_SCRIPT_KILL_GRACE_MS: '50' },
        stdio: ['ignore', 'ignore', 'pipe'],
      });

      await new Promise<void>((resolve) => {
        const started = Date.now();
        const poll = () => {
          try {
            readFileSync(pidFile, 'utf8');
            resolve();
          } catch {
            if (Date.now() - started > 1_000) {
              resolve();
              return;
            }
            setTimeout(poll, 20);
          }
        };
        poll();
      });

      const helperPid = Number.parseInt(readFileSync(pidFile, 'utf8'), 10);
      child.kill('SIGTERM');
      await new Promise((resolve) => child.on('close', resolve));
      await new Promise((resolve) => setTimeout(resolve, 100));

      let helperAlive = true;
      try {
        process.kill(helperPid, 0);
        helperAlive = readFileSync(`/proc/${helperPid}/stat`, 'utf8').split(' ')[2] !== 'Z';
      } catch (error) {
        const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code) : '';
        helperAlive = code !== 'ESRCH';
      }
      if (helperAlive) {
        process.kill(helperPid, 'SIGKILL');
      }
      expect(helperAlive).toBe(false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('keeps the force-kill timer active after the direct child exits during shutdown', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'franken-cron-orphan-descendant-'));
    const pidFile = join(tempDir, 'helper.pid');

    try {
      const child = spawn(process.execPath, [
        SCRIPT,
        '--name',
        'exiting-parent-descendant-signal-test',
        '--',
        process.execPath,
        '-e',
        `const { spawn } = require('node:child_process'); const helper = spawn(process.execPath, ['-e', 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000)'], { stdio: ['ignore', 'ignore', 'ignore'] }); require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(helper.pid)); process.on('SIGTERM', () => { process.exit(0); }); setInterval(() => {}, 1000);`,
      ], {
        cwd: ROOT,
        env: { ...process.env, TZ: 'UTC', CRON_SCRIPT_KILL_GRACE_MS: '50' },
        stdio: ['ignore', 'ignore', 'pipe'],
      });

      await new Promise<void>((resolve) => {
        const started = Date.now();
        const poll = () => {
          try {
            readFileSync(pidFile, 'utf8');
            resolve();
          } catch {
            if (Date.now() - started > 1_000) {
              resolve();
              return;
            }
            setTimeout(poll, 20);
          }
        };
        poll();
      });

      const helperPid = Number.parseInt(readFileSync(pidFile, 'utf8'), 10);
      child.kill('SIGTERM');
      await new Promise((resolve) => child.on('close', resolve));
      await new Promise((resolve) => setTimeout(resolve, 100));

      let helperAlive = true;
      try {
        process.kill(helperPid, 0);
        helperAlive = readFileSync(`/proc/${helperPid}/stat`, 'utf8').split(' ')[2] !== 'Z';
      } catch (error) {
        const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code) : '';
        helperAlive = code !== 'ESRCH';
      }
      if (helperAlive) {
        process.kill(helperPid, 'SIGKILL');
      }
      expect(helperAlive).toBe(false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('gives descendants the configured shutdown grace period after their parent exits', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'franken-cron-descendant-grace-'));
    const cleanupFile = join(tempDir, 'cleanup.done');
    const readyFile = join(tempDir, 'helper.ready');

    try {
      const child = spawn(process.execPath, [
        SCRIPT,
        '--name',
        'descendant-grace-test',
        '--',
        process.execPath,
        '-e',
        `const { spawn } = require('node:child_process'); const helper = spawn(process.execPath, ['-e', 'const fs = require("node:fs"); fs.writeFileSync(${JSON.stringify(readyFile)}, "ready"); process.on("SIGTERM", () => setTimeout(() => { fs.writeFileSync(${JSON.stringify(cleanupFile)}, "done"); process.exit(0); }, 120)); setInterval(() => {}, 1000)'], { stdio: ['ignore', 'ignore', 'ignore'] }); process.stderr.write('helper-started\\n'); process.on('SIGTERM', () => process.exit(0)); setInterval(() => {}, 1000);`,
      ], {
        cwd: ROOT,
        env: { ...process.env, TZ: 'UTC', CRON_SCRIPT_KILL_GRACE_MS: '500' },
        stdio: ['ignore', 'ignore', 'pipe'],
      });

      let stderr = '';
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
      });

      await new Promise<void>((resolve) => {
        const deadline = Date.now() + 1_000;
        const check = () => {
          if (stderr.includes('helper-started') && existsSync(readyFile)) {
            resolve();
            return;
          }
          if (Date.now() > deadline) {
            resolve();
            return;
          }
          setTimeout(check, 10);
        };
        check();
      });
      child.kill('SIGTERM');
      const status = await new Promise<number | null>((resolve) => child.on('close', (code) => resolve(code)));

      expect(status).toBe(128 + osConstants.signals.SIGTERM);
      expect(readFileSync(cleanupFile, 'utf8')).toBe('done');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
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
