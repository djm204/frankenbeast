export interface SandboxPolicy {
  readonly image: string;
  readonly network: 'none';
  readonly workspaceHostPath: string;
  readonly workspaceContainerPath: '/workspace';
  readonly envAllowlist: readonly string[];
  readonly user: `${number}:${number}`;
  readonly resourceLimits: SandboxResourceLimits;
  readonly readOnlyWorkspaceMount: boolean;
}

export interface SandboxResourceLimits {
  readonly memory: string;
  readonly cpus: string;
  readonly pidsLimit: number;
}

function defaultNonRootUser(): `${number}:${number}` {
  const uid = typeof process.getuid === 'function' ? process.getuid() : undefined;
  const gid = typeof process.getgid === 'function' ? process.getgid() : undefined;
  if (uid !== undefined && gid !== undefined && uid > 0) {
    return `${uid}:${gid}`;
  }
  return '10001:10001';
}

export const DEFAULT_BEAST_ENV_ALLOWLIST = [
  'PATH',
  'HOME',
  'LANG',
  'LC_ALL',
  'FRANKENBEAST_RUN_CONFIG',
  'FRANKENBEAST_SPAWNED',
  'FRANKENBEAST_MODULE_FIREWALL',
  'FRANKENBEAST_MODULE_SKILLS',
  'FRANKENBEAST_MODULE_MEMORY',
  'FRANKENBEAST_MODULE_PLANNER',
  'FRANKENBEAST_MODULE_CRITIQUE',
  'FRANKENBEAST_MODULE_GOVERNOR',
  'FRANKENBEAST_MODULE_HEARTBEAT',
] as const;

export const DEFAULT_SANDBOX_POLICY: SandboxPolicy = {
  image: 'fbeast/sandbox:latest',
  network: 'none',
  workspaceHostPath: process.cwd(),
  workspaceContainerPath: '/workspace',
  envAllowlist: DEFAULT_BEAST_ENV_ALLOWLIST,
  user: defaultNonRootUser(),
  resourceLimits: {
    memory: '512m',
    cpus: '1.0',
    pidsLimit: 256,
  },
  readOnlyWorkspaceMount: false,
};
