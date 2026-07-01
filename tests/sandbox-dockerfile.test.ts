import { readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function hasDocker(): boolean {
  const result = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  return !result.error && result.status === 0;
}

const dockerIt = hasDocker() ? it : it.skip;

describe('sandbox Dockerfile', () => {
  const dockerfile = readFileSync(resolve('Dockerfile'), 'utf8');

  it('builds the fbeast/sandbox image from an in-repo Node runtime Dockerfile', () => {
    expect(dockerfile).toContain('FROM node:22-bookworm-slim');
    expect(dockerfile).toContain('WORKDIR /workspace');
  });

  it('installs git for sandboxed martin-loop branch isolation', () => {
    expect(dockerfile).toContain('apt-get install -y --no-install-recommends git');
  });

  it('marks the mounted workspace safe for git when runtime falls back from root-owned mounts', () => {
    expect(dockerfile).toContain('git config --system --add safe.directory /workspace');
  });

  it('filters local secrets and heavy directories from the Docker build context', () => {
    const dockerignore = readFileSync(resolve('.dockerignore'), 'utf8');

    expect(dockerignore).toContain('.env');
    expect(dockerignore).toContain('!.env.example');
    expect(dockerignore).toContain('.fbeast');
    expect(dockerignore).toContain('.codex');
    expect(dockerignore).toContain('node_modules');
    expect(dockerignore).toContain('.git');
  });

  dockerIt('actually builds fbeast/sandbox:latest from the repo Dockerfile when Docker is available', () => {
    execFileSync('docker', ['build', '-t', 'fbeast/sandbox:latest', '-f', 'Dockerfile', '.'], {
      cwd: resolve('.'),
      stdio: 'pipe',
    });
  }, 60_000);

  it('declares a non-root default container UID', () => {
    const userLine = dockerfile.split('\n').find((line) => line.startsWith('USER '));

    expect(userLine).toBeDefined();
    expect(userLine).not.toBe('USER root');
    expect(userLine).not.toBe('USER 0');
    expect(userLine?.split(/\s+/)[1]?.split(':')[0]).not.toBe('0');
  });
});
