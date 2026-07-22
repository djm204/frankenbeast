import { readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { isAbsolute, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { readVitestFlag } from '../scripts/vitest-env.js';

function hasDocker(): boolean {
  const result = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  return !result.error && result.status === 0;
}

const optionsWithRequiredValue = new Set([
  '--config',
  '--coverage.exclude',
  '--coverage.extension',
  '--coverage.include',
  '--coverage.provider',
  '--coverage.reporter',
  '--coverage.reportsDirectory',
  '--coverage.thresholds.branches',
  '--coverage.thresholds.functions',
  '--coverage.thresholds.lines',
  '--coverage.thresholds.statements',
  '--coverage.watermarks.branches',
  '--coverage.watermarks.functions',
  '--coverage.watermarks.lines',
  '--coverage.watermarks.statements',
  '--dir',
  '--environment',
  '--exclude',
  '--include',
  '--pool',
  '--project',
  '--reporter',
  '--root',
  '--testNamePattern',
  '--test-name-pattern',
  '-c',
  '-r',
  '-t',
]);

function normalizeRequestedPath(arg: string): string {
  const normalized = arg.replace(/:\d+(?::\d+)?$/u, '').replace(/\\/gu, '/');
  if (isAbsolute(normalized)) {
    return relative(process.cwd(), normalized).replace(/\\/gu, '/');
  }
  return normalized.replace(/^\.\//u, '');
}

function collectRequestedPaths(args: readonly string[]): string[] {
  const paths: string[] = [];
  let skipOptionValue = false;

  for (const arg of args) {
    if (skipOptionValue) {
      skipOptionValue = false;
      continue;
    }

    if (arg === 'run') {
      continue;
    }

    if (arg.startsWith('-')) {
      const optionName = arg.includes('=') ? arg.slice(0, arg.indexOf('=')) : arg;
      if (optionsWithRequiredValue.has(optionName) && !arg.includes('=')) {
        skipOptionValue = true;
      }
      continue;
    }

    paths.push(normalizeRequestedPath(arg));
  }

  return paths;
}

interface DockerUser {
  user: string;
  group?: string;
}

function parseFinalDockerUser(contents: string): DockerUser | undefined {
  const finalStage = contents.split(/^[ \t]*FROM\s+.*$/gmu).at(-1);
  if (!finalStage || finalStage === contents) {
    return undefined;
  }

  const directives = [
    ...finalStage.matchAll(/^[ \t]*USER\s+([^\s:]+)(?::([^\s:]+))?\s*$/gmu),
  ];
  const match = directives.at(-1);
  if (!match?.[1]) {
    return undefined;
  }

  return { user: match[1], ...(match[2] ? { group: match[2] } : {}) };
}

function isNumericRootId(value: string): boolean {
  return /^[+-]?0+$/u.test(value);
}

function isNonRootDockerUser(contents: string): boolean {
  const directive = parseFinalDockerUser(contents);
  if (
    !directive?.group
    || directive.user.includes('$')
    || directive.group.includes('$')
    || directive.user === 'root'
    || directive.group === 'root'
    || isNumericRootId(directive.user)
    || isNumericRootId(directive.group)
  ) {
    return false;
  }

  return true;
}

const explicitDockerfileTestRequest = collectRequestedPaths(process.argv.slice(2))
  .includes('tests/sandbox-dockerfile.test.ts');
const runDockerBuild = readVitestFlag(process.env, 'DOCKER_BUILD') || explicitDockerfileTestRequest;
const dockerIt = runDockerBuild && hasDocker() ? it : it.skip;

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

  it('declares a non-root default container UID and GID', () => {
    const userDirective = parseFinalDockerUser(dockerfile);

    expect(userDirective, 'Dockerfile must declare a valid USER directive').toBeDefined();
    expect(
      isNonRootDockerUser(dockerfile),
      'Dockerfile USER must not use the root user or group',
    ).toBe(true);
  });

  it.each([
    ['numeric root user', 'FROM node\nUSER 00:1000'],
    ['named root user', 'FROM node\nUSER root:1000'],
    ['numeric root group', 'FROM node\nUSER 1000:+0'],
    ['named root group', 'FROM node\nUSER sandbox:root'],
    ['missing explicit group', 'FROM node\nUSER 1000'],
    ['later root-group override', 'FROM node\nUSER 1000:1000\nUSER 1000:0'],
    ['indented root override', 'FROM node\nUSER 1000:1000\n  USER root:0'],
    ['variable-based identity', 'FROM node\nUSER ${SANDBOX_UID}:${SANDBOX_GID}'],
    ['missing final-stage user', 'FROM node\nUSER 1000:1000\nFROM scratch'],
  ])('rejects a %s in the USER directive', (_description, contents) => {
    expect(isNonRootDockerUser(contents)).toBe(false);
  });
});
