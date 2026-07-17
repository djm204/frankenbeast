#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const dockerVersion = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], {
  encoding: 'utf8',
  stdio: 'pipe',
});

const ciRequiresDocker = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';

if (dockerVersion.error || dockerVersion.status !== 0) {
  const reason = dockerVersion.error?.message
    ?? dockerVersion.stderr?.trim()
    ?? `docker version exited with status ${dockerVersion.status}`;
  const message = `Docker sandbox build smoke test ${ciRequiresDocker ? 'failed' : 'skipped'}: Docker daemon unavailable (${reason}).`;
  if (ciRequiresDocker) {
    console.error(message);
    process.exit(1);
  }
  console.warn(message);
  process.exit(0);
}

const version = dockerVersion.stdout.trim() || 'unknown';
console.log(`Docker sandbox build smoke test running: Docker daemon ${version} is available.`);

const vitestArgs = [
  'node_modules/vitest/vitest.mjs',
  'run',
  'tests/sandbox-dockerfile.test.ts',
  '--reporter=verbose',
];
const result = spawnSync(process.execPath, vitestArgs, {
  env: {
    ...process.env,
    DOCKER_BUILD: 'true',
  },
  stdio: 'inherit',
});

if (result.error) {
  console.error(`Docker sandbox build smoke test failed to start: ${result.error.message}`);
  process.exit(1);
}

if (result.status === 0) {
  console.log('Docker sandbox build smoke test passed: fbeast/sandbox image builds from the repo Dockerfile.');
}

process.exit(result.status ?? 1);
