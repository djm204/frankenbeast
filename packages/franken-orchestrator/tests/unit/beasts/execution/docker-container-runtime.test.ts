import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { toDockerSpec } from '../../../../src/beasts/execution/docker-container-runtime.js';
import { DEFAULT_SANDBOX_POLICY } from '../../../../src/beasts/execution/sandbox-policy.js';

describe('toDockerSpec', () => {
  const base = {
    command: 'node',
    args: ['agent.js', '--run'],
    cwd: '/proj',
    env: {
      FRANKENBEAST_RUN_CONFIG: '/proj/.fbeast/rc.json',
      GITHUB_TOKEN: 'ghp_should_not_leak',
    },
  };

  it('runs through docker with no network and a workspace mount', () => {
    const spec = toDockerSpec(base, { ...DEFAULT_SANDBOX_POLICY, workspaceHostPath: '/proj' });

    expect(spec.command).toBe('docker');
    expect(spec.args).toEqual(expect.arrayContaining(['run', '--rm', '--network', 'none', '-w', '/workspace']));
    expect(spec.args).toEqual(expect.arrayContaining(['-v', '/proj:/workspace']));
  });

  it('enforces default resource limit flags for a memory-exceeding workload', () => {
    const exceedingWorkload = {
      ...base,
      args: [
        '-e',
        'const chunks=[]; while (true) chunks.push(Buffer.alloc(64 * 1024 * 1024));',
      ],
    };

    const spec = toDockerSpec(exceedingWorkload, { ...DEFAULT_SANDBOX_POLICY, workspaceHostPath: '/proj' });

    expect(spec.args).toEqual(expect.arrayContaining([
      '--memory',
      DEFAULT_SANDBOX_POLICY.resourceLimits.memory,
      '--cpus',
      DEFAULT_SANDBOX_POLICY.resourceLimits.cpus,
      '--pids-limit',
      String(DEFAULT_SANDBOX_POLICY.resourceLimits.pidsLimit),
    ]));
  });

  it('runs containers as a non-root UID/GID', () => {
    const spec = toDockerSpec({ ...base, command: 'id', args: ['-u'] }, { ...DEFAULT_SANDBOX_POLICY, workspaceHostPath: '/proj' });

    const userFlag = spec.args.indexOf('--user');
    expect(userFlag).toBeGreaterThan(-1);
    const user = spec.args[userFlag + 1];
    expect(user).toBe(DEFAULT_SANDBOX_POLICY.user);
    expect(user?.split(':')[0]).not.toBe('0');
  });

  it('uses the writable workspace owner UID/GID for bind-mounted workspaces', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'fbeast-owned-workspace-'));
    const spec = toDockerSpec(base, {
      ...DEFAULT_SANDBOX_POLICY,
      workspaceHostPath: workspace,
      user: '10001:10001',
    });

    const userFlag = spec.args.indexOf('--user');
    const expectedUser = process.getuid?.() === 0
      ? '10001:10001'
      : `${process.getuid?.()}:${process.getgid?.()}`;
    expect(spec.args[userFlag + 1]).toBe(expectedUser);
  });

  it('keeps the configured user for read-only workspace mounts', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'fbeast-readonly-workspace-'));
    const spec = toDockerSpec(base, {
      ...DEFAULT_SANDBOX_POLICY,
      workspaceHostPath: workspace,
      readOnlyWorkspaceMount: true,
      user: '10001:10001',
    });

    const userFlag = spec.args.indexOf('--user');
    expect(spec.args[userFlag + 1]).toBe('10001:10001');
  });

  it('supports an opt-in read-only workspace mount', () => {
    const spec = toDockerSpec(base, { ...DEFAULT_SANDBOX_POLICY, workspaceHostPath: '/proj', readOnlyWorkspaceMount: true });

    expect(spec.args).toEqual(expect.arrayContaining(['-v', '/proj:/workspace:ro']));
  });

  it('passes only allowlisted env via explicit -e values and inherits no host env', () => {
    const spec = toDockerSpec(base, { ...DEFAULT_SANDBOX_POLICY, workspaceHostPath: '/proj' });

    expect(spec.args).toEqual(expect.arrayContaining([
      '-e',
      'GIT_CONFIG_COUNT=1',
      '-e',
      'GIT_CONFIG_KEY_0=safe.directory',
      '-e',
      'GIT_CONFIG_VALUE_0=/workspace',
      '-e',
      'FRANKENBEAST_RUN_CONFIG=/workspace/.fbeast/rc.json',
    ]));
    expect(spec.args).not.toEqual(expect.arrayContaining(['-e', 'GITHUB_TOKEN=ghp_should_not_leak']));
    expect(spec.env).toEqual({});
  });

  it('appends the original command and args after the image', () => {
    const spec = toDockerSpec(base, { ...DEFAULT_SANDBOX_POLICY, image: 'fbeast/sandbox:1', workspaceHostPath: '/proj' });

    const i = spec.args.indexOf('fbeast/sandbox:1');
    expect(spec.args.slice(i + 1)).toEqual(['node', 'agent.js', '--run']);
  });

  it('preserves requested cwd inside the mounted workspace', () => {
    const spec = toDockerSpec({ ...base, cwd: '/proj/subdir' }, { ...DEFAULT_SANDBOX_POLICY, workspaceHostPath: '/proj' });

    const workdirFlag = spec.args.indexOf('-w');
    expect(spec.args[workdirFlag + 1]).toBe('/workspace/subdir');
  });

  it('remaps workspace-local absolute command and arg paths into the container', () => {
    const spec = toDockerSpec(
      { ...base, command: '/proj/bin/agent', args: ['/proj/scripts/run.js', '--config', '/proj/.fbeast/rc.json'] },
      { ...DEFAULT_SANDBOX_POLICY, workspaceHostPath: '/proj', image: 'fbeast/sandbox:1' },
    );

    const i = spec.args.indexOf('fbeast/sandbox:1');
    expect(spec.args.slice(i + 1)).toEqual([
      '/workspace/bin/agent',
      '/workspace/scripts/run.js',
      '--config',
      '/workspace/.fbeast/rc.json',
    ]);
  });

  it('uses container PATH for host absolute commands outside the mounted workspace', () => {
    const spec = toDockerSpec(
      { ...base, command: '/host/node/bin/node' },
      { ...DEFAULT_SANDBOX_POLICY, workspaceHostPath: '/proj', image: 'fbeast/sandbox:1' },
    );

    const i = spec.args.indexOf('fbeast/sandbox:1');
    expect(spec.args[i + 1]).toBe('node');
  });

  it('canonicalizes symlinked workspace paths before remapping container args', () => {
    const realRoot = mkdtempSync(join(tmpdir(), 'fbeast-real-root-'));
    const linkParent = mkdtempSync(join(tmpdir(), 'fbeast-link-root-'));
    const linkRoot = join(linkParent, 'workspace');
    mkdirSync(join(realRoot, '.fbeast'), { recursive: true });
    const configPath = join(realRoot, '.fbeast', 'rc.json');
    writeFileSync(configPath, '{}\n', 'utf8');
    symlinkSync(realRoot, linkRoot, 'dir');

    const spec = toDockerSpec(
      { ...base, cwd: realRoot, args: [configPath], env: { FRANKENBEAST_RUN_CONFIG: configPath } },
      { ...DEFAULT_SANDBOX_POLICY, workspaceHostPath: linkRoot, image: 'fbeast/sandbox:1' },
    );

    expect(spec.args).toEqual(expect.arrayContaining(['-w', '/workspace']));
    expect(spec.args).toEqual(expect.arrayContaining(['-e', 'FRANKENBEAST_RUN_CONFIG=/workspace/.fbeast/rc.json']));
    const i = spec.args.indexOf('fbeast/sandbox:1');
    expect(spec.args.slice(i + 1)).toContain('/workspace/.fbeast/rc.json');
  });

  it('remaps POSIX workspace paths containing colon characters', () => {
    const spec = toDockerSpec(
      { ...base, args: ['/proj/data/a:b.json'] },
      { ...DEFAULT_SANDBOX_POLICY, workspaceHostPath: '/proj', image: 'fbeast/sandbox:1' },
    );

    const i = spec.args.indexOf('fbeast/sandbox:1');
    expect(spec.args.slice(i + 1)).toContain('/workspace/data/a:b.json');
  });
});
