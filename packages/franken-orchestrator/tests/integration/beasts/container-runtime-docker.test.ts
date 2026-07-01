import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));

function hasDocker(): boolean {
  const result = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  return !result.error && result.status === 0;
}

const dockerIt = hasDocker() ? it : it.skip;

describe('sandbox Docker runtime enforcement', () => {
  dockerIt('builds the sandbox image and enforces memory limits on an exceeding workload', () => {
    const tag = `fbeast/sandbox:test-${process.pid}`;
    execFileSync('docker', ['build', '-t', tag, '-f', 'Dockerfile', '.'], {
      cwd: join(__dirname, '../../../../..'),
      stdio: 'pipe',
    });

    const workspace = mkdtempSync(join(tmpdir(), 'fbeast-sandbox-runtime-'));
    const script = join(workspace, 'memory-hog.js');
    writeFileSync(script, 'const chunks=[]; while (true) chunks.push(Buffer.alloc(32 * 1024 * 1024));\n', 'utf8');

    const result = spawnSync('docker', [
      'run',
      '--rm',
      '--network',
      'none',
      '--memory',
      '64m',
      '--cpus',
      '1.0',
      '--pids-limit',
      '64',
      '--user',
      `${process.getuid?.() ?? 10001}:${process.getgid?.() ?? 10001}`,
      '-v',
      `${workspace}:/workspace`,
      '-w',
      '/workspace',
      tag,
      'node',
      'memory-hog.js',
    ], {
      encoding: 'utf8',
      timeout: 20_000,
    });

    expect(result.status).not.toBe(0);
  }, 60_000);

  dockerIt('runs the default writable workspace mount as a non-root host UID/GID that can write artifacts', () => {
    const tag = `fbeast/sandbox:test-${process.pid}`;
    execFileSync('docker', ['build', '-t', tag, '-f', 'Dockerfile', '.'], {
      cwd: join(__dirname, '../../../../..'),
      stdio: 'pipe',
    });

    const workspace = mkdtempSync(join(tmpdir(), 'fbeast-sandbox-write-'));
    const uid = process.getuid?.() ?? 10001;
    const gid = process.getgid?.() ?? 10001;
    expect(uid).not.toBe(0);

    const result = spawnSync('docker', [
      'run',
      '--rm',
      '--network',
      'none',
      '--user',
      `${uid}:${gid}`,
      '-v',
      `${workspace}:/workspace`,
      '-w',
      '/workspace',
      tag,
      'sh',
      '-lc',
      'test "$(id -u)" != "0" && echo artifact > .fbeast-container-write-test',
    ], {
      encoding: 'utf8',
      timeout: 20_000,
    });

    expect(result.status).toBe(0);
  }, 60_000);
});
