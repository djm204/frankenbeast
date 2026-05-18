# Chunk 3: Sandboxed Beast Execution — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the throwing `ContainerBeastExecutor` placeholder with a real Docker `--network=none` executor, and stop process mode from inheriting host secrets by switching to an env allowlist with cwd containment.

**Architecture:** Introduce one shared `sandbox-policy.ts` (env allowlist + policy types) consumed by both execution backends. `DockerContainerRuntime` transforms a `BeastProcessSpec` into a Docker `BeastProcessSpec`; `ContainerBeastExecutor` reuses the existing `ProcessBeastExecutor` lifecycle by delegating through a spec-transforming supervisor (DRY, no real Docker daemon needed for tests). `ProcessSupervisor` builds child env from the allowlist + explicit `spec.env` only, and rejects a `cwd` escaping the configured root.

**Tech Stack:** TypeScript, Node `child_process`, Docker CLI (first concrete backend), Vitest.

---

## Verified Gap Evidence (current `main` @ `610a0ea`, 2026-05-17)

- `packages/franken-orchestrator/src/beasts/execution/container-beast-executor.ts` — `start`/`stop`/`kill` all `throw new Error('ContainerBeastExecutor is not implemented yet')`.
- `packages/franken-orchestrator/src/beasts/execution/process-supervisor.ts:46-49` — child `env: { ...stripClaudeEnvVars(process.env), ...spec.env }`: only `CLAUDE*` is stripped; the entire rest of host env is inherited. `cwd: spec.cwd` is an unchecked passthrough.
- `packages/franken-orchestrator/src/beasts/create-beast-services.ts:47` — `container: new ContainerBeastExecutor()` (the placeholder).
- `BeastProcessSpec` (`src/beasts/types.ts:32`): `{ command; args; cwd?; env? }` — the transform target type.
- `ProcessBeastExecutor` (`src/beasts/execution/process-beast-executor.ts:34`): `constructor(repository, logStore, supervisor: ProcessSupervisorLike, { onRunStatusChange, eventBus })`; calls `this.supervisor.spawn(mergedSpec, …)` at `:75`. Reusable for container mode by swapping the supervisor.

## File Structure

- Create `packages/franken-orchestrator/src/beasts/execution/sandbox-policy.ts` — `SandboxPolicy` type + `DEFAULT_BEAST_ENV_ALLOWLIST` (single source of truth for both backends).
- Create `packages/franken-orchestrator/src/beasts/execution/docker-container-runtime.ts` — `toDockerSpec(spec, policy): BeastProcessSpec`.
- Modify `packages/franken-orchestrator/src/beasts/execution/container-beast-executor.ts` — real executor delegating to `ProcessBeastExecutor` via a Docker-transforming supervisor.
- Modify `packages/franken-orchestrator/src/beasts/execution/process-supervisor.ts` — allowlist env + cwd containment.
- Modify `packages/franken-orchestrator/src/beasts/create-beast-services.ts:47` — construct the real container executor.
- Tests: add `tests/unit/beasts/execution/docker-container-runtime.test.ts`; modify `tests/unit/beasts/container-beast-executor.test.ts`, `tests/unit/beasts/execution/process-supervisor.test.ts`.

---

## Task 1: Sandbox policy + Docker spec builder

**Files:**
- Create: `packages/franken-orchestrator/src/beasts/execution/sandbox-policy.ts`
- Create: `packages/franken-orchestrator/src/beasts/execution/docker-container-runtime.ts`
- Test: `packages/franken-orchestrator/tests/unit/beasts/execution/docker-container-runtime.test.ts`

- [ ] **Step 1: Write the failing Docker-spec test**

Create `tests/unit/beasts/execution/docker-container-runtime.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toDockerSpec } from '../../../../src/beasts/execution/docker-container-runtime.js';
import { DEFAULT_SANDBOX_POLICY } from '../../../../src/beasts/execution/sandbox-policy.js';

describe('toDockerSpec', () => {
  const base = { command: 'node', args: ['agent.js', '--run'], cwd: '/proj', env: { FRANKENBEAST_RUN_CONFIG: '/proj/.fbeast/rc.json' } };

  it('runs through docker with no network and a workspace mount', () => {
    const spec = toDockerSpec(base, { ...DEFAULT_SANDBOX_POLICY, workspaceHostPath: '/proj' });
    expect(spec.command).toBe('docker');
    expect(spec.args).toEqual(expect.arrayContaining(['run', '--rm', '--network', 'none', '-w', '/workspace']));
    expect(spec.args).toEqual(expect.arrayContaining(['-v', '/proj:/workspace']));
  });

  it('passes only allowlisted env via -e and inherits no host env', () => {
    const spec = toDockerSpec(base, { ...DEFAULT_SANDBOX_POLICY, workspaceHostPath: '/proj' });
    expect(spec.args).toEqual(expect.arrayContaining(['-e', 'FRANKENBEAST_RUN_CONFIG']));
    expect(spec.args).not.toEqual(expect.arrayContaining(['-e', 'GITHUB_TOKEN']));
    expect(spec.env).toEqual({}); // docker process itself gets no inherited env
  });

  it('appends the original command and args after the image', () => {
    const spec = toDockerSpec(base, { ...DEFAULT_SANDBOX_POLICY, image: 'fbeast/sandbox:1', workspaceHostPath: '/proj' });
    const i = spec.args.indexOf('fbeast/sandbox:1');
    expect(spec.args.slice(i + 1)).toEqual(['node', 'agent.js', '--run']);
  });
});
```

- [ ] **Step 2: Run, verify failure**

Run: `cd packages/franken-orchestrator && npm test -- --run tests/unit/beasts/execution/docker-container-runtime.test.ts`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Create `sandbox-policy.ts`**

```ts
export interface SandboxPolicy {
  readonly image: string;
  readonly network: 'none';
  readonly workspaceHostPath: string;
  readonly workspaceContainerPath: '/workspace';
  readonly envAllowlist: readonly string[];
}

export const DEFAULT_BEAST_ENV_ALLOWLIST = [
  'PATH', 'HOME', 'LANG', 'LC_ALL',
  'FRANKENBEAST_RUN_CONFIG',
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
};
```

- [ ] **Step 4: Create `docker-container-runtime.ts`**

```ts
import type { BeastProcessSpec } from '../types.js';
import type { SandboxPolicy } from './sandbox-policy.js';

export function toDockerSpec(spec: BeastProcessSpec, policy: SandboxPolicy): BeastProcessSpec {
  const envArgs: string[] = [];
  for (const key of policy.envAllowlist) {
    if (spec.env && key in spec.env) envArgs.push('-e', key);
  }
  const args = [
    'run', '--rm',
    '--network', policy.network,
    '-v', `${policy.workspaceHostPath}:${policy.workspaceContainerPath}`,
    '-w', policy.workspaceContainerPath,
    ...envArgs,
    policy.image,
    spec.command,
    ...spec.args,
  ];
  // Pass allowlisted values through docker's own env so `-e KEY` resolves.
  const passEnv: Record<string, string> = {};
  for (const key of policy.envAllowlist) {
    if (spec.env && spec.env[key] !== undefined) passEnv[key] = spec.env[key] as string;
  }
  return { command: 'docker', args, cwd: spec.cwd, env: {} , // docker client inherits nothing
    // values are forwarded into the container via the supervisor env merge below
  } as BeastProcessSpec & { passEnv?: Record<string, string> };
}
```

Note: keep `spec.env` as `{}` for the docker client process (the test asserts this); the allowlisted values are forwarded by the supervisor (Task 3) which merges `spec.env`. If the codebase prefers explicit `-e KEY=VALUE`, change `envArgs.push('-e', key)` to `envArgs.push('-e', \`${key}=${spec.env[key]}\`)` and drop `passEnv`; update the Step-1 test's `-e` assertion to match. Pick one form and keep it consistent across Task 1 and Task 3.

- [ ] **Step 5: Run, verify pass**

Run: `cd packages/franken-orchestrator && npm test -- --run tests/unit/beasts/execution/docker-container-runtime.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/franken-orchestrator/src/beasts/execution/sandbox-policy.ts packages/franken-orchestrator/src/beasts/execution/docker-container-runtime.ts packages/franken-orchestrator/tests/unit/beasts/execution/docker-container-runtime.test.ts
git commit -m "feat(orchestrator): add sandbox policy and docker spec builder"
```

---

## Task 2: Real ContainerBeastExecutor

**Files:**
- Modify: `packages/franken-orchestrator/src/beasts/execution/container-beast-executor.ts`
- Modify: `packages/franken-orchestrator/src/beasts/create-beast-services.ts:47`
- Test: `packages/franken-orchestrator/tests/unit/beasts/container-beast-executor.test.ts`

- [ ] **Step 1: Write the failing executor test**

Replace the placeholder test body with one that injects a fake supervisor and asserts the Docker transform is applied and lifecycle delegates:

```ts
it('spawns the docker-transformed spec and reports a running attempt', async () => {
  const spawned: BeastProcessSpec[] = [];
  const fakeSupervisor = {
    spawn: async (spec) => { spawned.push(spec); return { pid: 4242 }; },
    stop: async () => {}, kill: async () => {},
  };
  const exec = new ContainerBeastExecutor({
    repository, logStore, eventBus,
    supervisorFactory: () => fakeSupervisor,
    policy: { ...DEFAULT_SANDBOX_POLICY, image: 'fbeast/sandbox:test', workspaceHostPath: '/proj' },
  });
  const attempt = await exec.start(run, definition);
  expect(attempt.pid).toBe(4242);
  expect(spawned[0].command).toBe('docker');
  expect(spawned[0].args).toEqual(expect.arrayContaining(['--network', 'none']));
});
```

(`repository`, `logStore`, `eventBus`, `run`, `definition` come from the existing test fixtures in this file / sibling `process-beast-executor.test.ts`.)

- [ ] **Step 2: Run, verify failure**

Run: `cd packages/franken-orchestrator && npm test -- --run tests/unit/beasts/container-beast-executor.test.ts`
Expected: FAIL — current executor throws "not implemented yet".

- [ ] **Step 3: Implement by delegation**

Rewrite `container-beast-executor.ts` to compose a `ProcessBeastExecutor` whose supervisor wraps `toDockerSpec`:

```ts
import type { BeastExecutor, StopOptions } from './beast-executor.js';
import type { BeastDefinition, BeastRun, BeastRunAttempt, BeastProcessSpec } from '../types.js';
import { ProcessBeastExecutor } from './process-beast-executor.js';
import { ProcessSupervisor, type ProcessSupervisorLike, type ProcessCallbacks } from './process-supervisor.js';
import { toDockerSpec } from './docker-container-runtime.js';
import { DEFAULT_SANDBOX_POLICY, type SandboxPolicy } from './sandbox-policy.js';

export interface ContainerBeastExecutorDeps {
  repository: ConstructorParameters<typeof ProcessBeastExecutor>[0];
  logStore: ConstructorParameters<typeof ProcessBeastExecutor>[1];
  eventBus: { /* same shape passed in create-beast-services */ } | undefined;
  policy?: SandboxPolicy;
  supervisorFactory?: () => ProcessSupervisorLike;
}

class DockerSupervisor implements ProcessSupervisorLike {
  constructor(private inner: ProcessSupervisorLike, private policy: SandboxPolicy) {}
  spawn(spec: BeastProcessSpec, cb: ProcessCallbacks) { return this.inner.spawn(toDockerSpec(spec, this.policy), cb); }
  stop(pid: number) { return this.inner.stop(pid); }
  kill(pid: number) { return this.inner.kill(pid); }
}

export class ContainerBeastExecutor implements BeastExecutor {
  private readonly inner: ProcessBeastExecutor;
  constructor(deps: ContainerBeastExecutorDeps) {
    const policy = deps.policy ?? DEFAULT_SANDBOX_POLICY;
    const base = deps.supervisorFactory ? deps.supervisorFactory() : new ProcessSupervisor();
    this.inner = new ProcessBeastExecutor(
      deps.repository, deps.logStore, new DockerSupervisor(base, policy),
      { onRunStatusChange: () => {}, eventBus: deps.eventBus } as never,
    );
  }
  start(run: BeastRun, definition: BeastDefinition): Promise<BeastRunAttempt> { return this.inner.start(run, definition); }
  stop(runId: string, attemptId: string, options?: StopOptions): Promise<BeastRunAttempt> { return this.inner.stop(runId, attemptId, options); }
  kill(runId: string, attemptId: string): Promise<BeastRunAttempt> { return this.inner.kill(runId, attemptId); }
}
```

Match `repository`/`logStore`/`eventBus`/`onRunStatusChange` to the exact `ProcessBeastExecutor` constructor types in this repo (read `process-beast-executor.ts:34`) and replace the placeholder `ConstructorParameters` shorthands with the concrete imported types.

- [ ] **Step 4: Wire `create-beast-services.ts`**

Replace `container: new ContainerBeastExecutor()` (line 47) with:

```ts
container: new ContainerBeastExecutor({
  repository, logStore, eventBus,
  policy: { ...DEFAULT_SANDBOX_POLICY, workspaceHostPath: process.env.FBEAST_ROOT ?? process.cwd() },
}),
```

Add the `DEFAULT_SANDBOX_POLICY` import.

- [ ] **Step 5: Run, verify pass**

Run: `cd packages/franken-orchestrator && npm test -- --run tests/unit/beasts/container-beast-executor.test.ts tests/integration/beasts/beast-routes.test.ts tests/integration/beasts/agent-routes.test.ts`
Expected: PASS (no real Docker daemon — supervisor is faked in unit; integration uses `process` mode).

- [ ] **Step 6: Commit**

```bash
git add packages/franken-orchestrator/src/beasts/execution/container-beast-executor.ts packages/franken-orchestrator/src/beasts/create-beast-services.ts packages/franken-orchestrator/tests/unit/beasts/container-beast-executor.test.ts
git commit -m "feat(orchestrator): run beast container mode in a no-network sandbox"
```

---

## Task 3: Process-mode env allowlist + cwd containment

**Files:**
- Modify: `packages/franken-orchestrator/src/beasts/execution/process-supervisor.ts:38-50`
- Test: `packages/franken-orchestrator/tests/unit/beasts/execution/process-supervisor.test.ts`

- [ ] **Step 1: Write the failing env/cwd test**

```ts
it('does not inherit arbitrary host env into the child', async () => {
  process.env.GITHUB_TOKEN = 'ghp_should_not_leak';
  process.env.SECRET_X = 'nope';
  const sup = new ProcessSupervisor({ projectRoot: tmpRoot });
  const seen = await captureChildEnv(sup, { command: process.execPath, args: ['-e', 'console.log(JSON.stringify(process.env))'], cwd: tmpRoot, env: { FRANKENBEAST_RUN_CONFIG: '/x' } });
  expect(seen.GITHUB_TOKEN).toBeUndefined();
  expect(seen.SECRET_X).toBeUndefined();
  expect(seen.FRANKENBEAST_RUN_CONFIG).toBe('/x');
  expect(seen.PATH).toBeDefined?.() ?? expect(seen.PATH).toBeTruthy();
});

it('rejects a cwd outside the configured project root', async () => {
  const sup = new ProcessSupervisor({ projectRoot: tmpRoot });
  await expect(sup.spawn({ command: 'node', args: [], cwd: '/etc' }, noopCallbacks))
    .rejects.toThrow(/cwd.*outside.*root/i);
});
```

(`captureChildEnv` = small helper that spawns the spec, collects stdout JSON, resolves on exit; reuse the existing process-supervisor test harness pattern.)

- [ ] **Step 2: Run, verify failure**

Run: `cd packages/franken-orchestrator && npm test -- --run tests/unit/beasts/execution/process-supervisor.test.ts`
Expected: FAIL — `GITHUB_TOKEN`/`SECRET_X` leak; no `projectRoot` ctor option.

- [ ] **Step 3: Implement allowlist + containment**

In `process-supervisor.ts`:

```ts
import { resolve, sep } from 'node:path';
import { DEFAULT_BEAST_ENV_ALLOWLIST } from './sandbox-policy.js';

function allowlistedEnv(env: NodeJS.ProcessEnv): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const key of DEFAULT_BEAST_ENV_ALLOWLIST) {
    if (env[key] !== undefined) out[key] = env[key];
  }
  return out;
}

export interface ProcessSupervisorOptions { projectRoot?: string }
```

Add a constructor: `constructor(private readonly options: ProcessSupervisorOptions = {}) {}`. In `spawn`, before `spawn(...)`:

```ts
if (this.options.projectRoot && spec.cwd) {
  const root = resolve(this.options.projectRoot);
  const target = resolve(spec.cwd);
  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error(`Refusing to spawn with cwd outside project root: ${spec.cwd}`);
  }
}
```

Replace the `env:` block with:

```ts
env: {
  ...allowlistedEnv(process.env),
  ...spec.env,
},
```

(`stripClaudeEnvVars` is now subsumed by the allowlist — delete it and its usage.)

- [ ] **Step 4: Run, verify pass**

Run: `cd packages/franken-orchestrator && npm test -- --run tests/unit/beasts/execution/process-supervisor.test.ts`
Expected: PASS. Update existing process-supervisor tests that relied on inherited host env to pass needed vars via explicit `spec.env`.

- [ ] **Step 5: Wire `projectRoot` at construction**

In `create-beast-services.ts`, change `new ProcessSupervisor()` (line 43) to `new ProcessSupervisor({ projectRoot: process.env.FBEAST_ROOT ?? process.cwd() })`.

- [ ] **Step 6: Commit**

```bash
git add packages/franken-orchestrator/src/beasts/execution/process-supervisor.ts packages/franken-orchestrator/src/beasts/create-beast-services.ts packages/franken-orchestrator/tests/unit/beasts/execution/process-supervisor.test.ts
git commit -m "fix(orchestrator): allowlist process env and contain cwd"
```

---

## Task 4: Closeout — ADR + audit follow-up + verification

**Files:**
- Create: `docs/adr/036-sandboxed-beast-execution.md`
- Modify: `docs/guides/run-cli-beast.md`
- Modify: `docs/audits/agent-systems-audit-2026-04-28.md`

- [ ] **Step 1: Write ADR-036**

Document: container mode = Docker `--network none` + explicit single workspace mount + env allowlist; process mode = env allowlist + optional cwd containment, **not** a hard sandbox. Explicitly state gVisor/Firecracker remain future backends and `--network none` must not be marketed as micro-VM isolation.

- [ ] **Step 2: Update `docs/guides/run-cli-beast.md`**

Add an operator section: Docker prerequisite for container mode, how network denial works, the env allowlist (and how to extend it via `spec.env`), and that process mode is not a hard sandbox.

- [ ] **Step 3: Audit follow-up**

Map Pillar-1 gaps "Container mode is not implemented" → `fixed`; "broad environment inheritance" → `fixed`; "No micro-VM/gVisor/Wasm sandbox" / "Network air-gapping not OS-enforced for process mode" → `partially-fixed` (container has `--network none`; process mode does not). Cite commits/tests.

- [ ] **Step 4: Verify the chunk**

```bash
cd packages/franken-orchestrator && npm test -- --run tests/unit/beasts/execution/docker-container-runtime.test.ts tests/unit/beasts/container-beast-executor.test.ts tests/unit/beasts/execution/process-supervisor.test.ts tests/integration/beasts/beast-routes.test.ts tests/integration/beasts/agent-routes.test.ts && npm run typecheck
```
Expected: all exit `0`.

- [ ] **Step 5: Commit**

```bash
git add docs/adr/036-sandboxed-beast-execution.md docs/guides/run-cli-beast.md docs/audits/agent-systems-audit-2026-04-28.md
git commit -m "docs: ADR-036 and audit follow-up for sandboxed execution"
```

---

## Self-Review

- **Spec coverage:** Container placeholder, host-env inheritance, and (partially) network/process-isolation gaps each have a failing-first task. The `partially-fixed` framing for process-mode network is explicit, not silently overclaimed.
- **Placeholder scan:** Real code in every step; the one genuine fork (docker `-e KEY` vs `-e KEY=VALUE`) is called out with an instruction to pick one form and keep Task 1/Task 3 consistent — not left vague.
- **Type consistency:** `BeastProcessSpec` reused unchanged; `SandboxPolicy`/`DEFAULT_BEAST_ENV_ALLOWLIST`/`DEFAULT_SANDBOX_POLICY` named identically across `sandbox-policy.ts`, `docker-container-runtime.ts`, `container-beast-executor.ts`, `process-supervisor.ts`, and tests; `ContainerBeastExecutor` reuses `ProcessBeastExecutor` (DRY); `toDockerSpec` is the single transform.

## Execution Handoff

Plan complete. **(1) Subagent-Driven (recommended)** or **(2) Inline Execution** via executing-plans. The `ProcessBeastExecutor` constructor types must be read from source during Task 2 Step 3 — flagged inline.
