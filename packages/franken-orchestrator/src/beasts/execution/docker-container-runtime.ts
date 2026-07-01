import type { BeastProcessSpec } from '../types.js';
import type { SandboxPolicy } from './sandbox-policy.js';
import { basename, isAbsolute, relative, resolve, sep } from 'node:path';
import { realpathSync } from 'node:fs';

function canonicalExistingPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function remapHostWorkspacePath(value: string, policy: SandboxPolicy): string {
  if (!isAbsolute(value)) {
    return value;
  }

  const hostRoot = canonicalExistingPath(policy.workspaceHostPath);
  const resolvedValue = canonicalExistingPath(value);
  const rel = relative(hostRoot, resolvedValue);
  if (rel === '') {
    return policy.workspaceContainerPath;
  }
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    return value;
  }

  return `${policy.workspaceContainerPath}/${rel.split(sep).join('/')}`;
}

function containerCommand(command: string, policy: SandboxPolicy): string {
  const remapped = remapHostWorkspacePath(command, policy);
  if (remapped !== command || !isAbsolute(command)) {
    return remapped;
  }
  return basename(command);
}

function dockerEnvArgs(spec: BeastProcessSpec, policy: SandboxPolicy): string[] {
  const args: string[] = [];
  for (const key of policy.envAllowlist) {
    const value = spec.env?.[key];
    if (value !== undefined) {
      args.push('-e', `${key}=${remapHostWorkspacePath(value, policy)}`);
    }
  }
  return args;
}

function containerCwd(spec: BeastProcessSpec, policy: SandboxPolicy): string {
  return remapHostWorkspacePath(spec.cwd ?? policy.workspaceHostPath, policy);
}

function workspaceMount(policy: SandboxPolicy): string {
  const accessMode = policy.readOnlyWorkspaceMount ? ':ro' : '';
  return `${policy.workspaceHostPath}:${policy.workspaceContainerPath}${accessMode}`;
}

export function toDockerSpec(spec: BeastProcessSpec, policy: SandboxPolicy): BeastProcessSpec {
  return {
    command: 'docker',
    args: [
      'run',
      '--rm',
      '--network',
      policy.network,
      '--memory',
      policy.resourceLimits.memory,
      '--cpus',
      policy.resourceLimits.cpus,
      '--pids-limit',
      String(policy.resourceLimits.pidsLimit),
      '--user',
      policy.user,
      '--security-opt',
      'no-new-privileges',
      '-v',
      workspaceMount(policy),
      '-w',
      containerCwd(spec, policy),
      ...dockerEnvArgs(spec, policy),
      policy.image,
      containerCommand(spec.command, policy),
      ...spec.args.map((arg) => remapHostWorkspacePath(arg, policy)),
    ],
    cwd: spec.cwd,
    env: {},
  };
}
