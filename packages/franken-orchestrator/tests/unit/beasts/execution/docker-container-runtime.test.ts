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

  it('passes only allowlisted env via explicit -e values and inherits no host env', () => {
    const spec = toDockerSpec(base, { ...DEFAULT_SANDBOX_POLICY, workspaceHostPath: '/proj' });

    expect(spec.args).toEqual(expect.arrayContaining(['-e', 'FRANKENBEAST_RUN_CONFIG=/workspace/.fbeast/rc.json']));
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
