# Beast Mode Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the live `packages/franken-orchestrator` beast surface fully usable by closing config/flag no-ops, removing permissive required-path fallbacks, implementing explicit resume semantics, hardening every shipped command family, and ending with an authoritative beast verification matrix.

**Architecture:** Harden in place. Keep `franken-orchestrator` as the single live beast surface, thread config and runtime controls end-to-end through `args.ts -> run.ts -> session.ts -> dep-factory.ts -> BeastLoop`, replace silent degradation on required module paths with real wiring or explicit failure, and use focused integration/E2E tests as the release gate. Avoid modular cleanup unless it directly unblocks correctness on the shipped CLI or server surface.

**Tech Stack:** TypeScript, npm workspaces, Vitest, Hono, `better-sqlite3`, `franken-brain`, `@franken/critique`, `@franken/governor`, `@frankenbeast/observer`, `franken-orchestrator`

---

## File Structure

### Existing files to modify

- Modify: `packages/franken-orchestrator/src/cli/args.ts`
  Reason: stop forcing a hidden provider default when config should win, thread `resume` semantics intentionally, and keep usage text aligned with the real surface.
- Modify: `packages/franken-orchestrator/src/cli/config-loader.ts`
  Reason: map CLI/env/file overrides for the live beast config surface instead of only toggling tracing on `--verbose`.
- Modify: `packages/franken-orchestrator/src/cli/run-config-loader.ts`
  Reason: keep spawned-agent run-config semantics aligned with the hardened live CLI contract.
- Modify: `packages/franken-orchestrator/src/cli/run.ts`
  Reason: resolve the effective provider/config truthfully, pass the full config surface into `Session`, and keep command-family routing authoritative.
- Modify: `packages/franken-orchestrator/src/cli/session.ts`
  Reason: propagate config/runtime flags into dependency construction and `BeastLoop`, make `--resume` real on the main run path, and keep phase cleanup deterministic.
- Modify: `packages/franken-orchestrator/src/cli/dep-factory.ts`
  Reason: harden required module construction, remove permissive required-path fallbacks, and thread config/resume/module state into the actual runtime assembly.
- Modify: `packages/franken-orchestrator/src/cli/create-beast-deps.ts`
  Reason: supply real dependencies for middleware, memory, heartbeat, skills, MCP, and provider-backed runtime surfaces instead of tolerating placeholder assembly on required paths.
- Modify: `packages/franken-orchestrator/src/adapters/mcp-sdk-adapter.ts`
  Reason: replace the placeholder echo implementation with a real tool catalog and invocation adapter used by the live beast surface.
- Modify: `packages/franken-orchestrator/package.json`
  Reason: expose a single authoritative beast verification script for the hardened surface.
- Modify: `packages/franken-orchestrator/tests/unit/cli/args.test.ts`
  Reason: lock down provider/config precedence and `resume` parsing semantics.
- Modify: `packages/franken-orchestrator/tests/unit/cli/config-loader.test.ts`
  Reason: verify CLI/env/file precedence for the live beast config surface.
- Modify: `packages/franken-orchestrator/tests/unit/cli/config-loader-providers.test.ts`
  Reason: verify provider default resolution and provider override propagation.
- Modify: `packages/franken-orchestrator/tests/unit/cli/run.test.ts`
  Reason: verify `main()` passes the hardened config surface into `Session` and keeps command-family routing stable.
- Modify: `packages/franken-orchestrator/tests/unit/cli/session.test.ts`
  Reason: verify `Session` threads config and resume behavior into the live execution path.
- Modify: `packages/franken-orchestrator/tests/integration/cli/dep-factory-wiring.test.ts`
  Reason: stop accepting graceful required-path fallback behavior and prove the real dependency graph is assembled.
- Modify: `packages/franken-orchestrator/tests/e2e/chunk-pipeline.test.ts`
  Reason: prove checkpoint + resume semantics on the real chunk execution path.
- Modify: `packages/franken-orchestrator/tests/e2e/cli-e2e.test.ts`
  Reason: convert the current timeout-prone E2E into a trustworthy main-path proof.
- Modify: `packages/franken-orchestrator/tests/integration/network/network-cli.test.ts`
  Reason: keep the live `network` surface inside the release gate.
- Modify: `packages/franken-orchestrator/tests/integration/issues/issues-e2e.test.ts`
  Reason: keep the live `issues` surface inside the release gate.
- Modify: `packages/franken-orchestrator/tests/integration/chat/chat-server.test.ts`
  Reason: keep `chat-server` inside the release gate.
- Modify: `packages/franken-orchestrator/tests/integration/beasts/beast-routes.test.ts`
  Reason: keep tracked Beast runs inside the release gate.
- Modify: `packages/franken-orchestrator/tests/integration/beasts/agent-routes.test.ts`
  Reason: keep tracked-agent lifecycle endpoints inside the release gate.
- Modify: `docs/guides/run-cli-beast.md`
  Reason: align the live beast usage guide with the real hardened surface and the verification matrix.
- Modify: `docs/PROGRESS.md`
  Reason: record beast hardening completion against the live release story.
- Modify: `tasks/todo.md`
  Reason: track chunk completion and final verification evidence.

### New files to create

- Create: `packages/franken-orchestrator/tests/integration/cli/run-config-surface.test.ts`
  Reason: prove config/flag values materially change runtime behavior on the live beast path.
- Create: `packages/franken-orchestrator/tests/integration/cli/run-resume.test.ts`
  Reason: prove `frankenbeast run --resume` differs from a cold run and fails clearly without a checkpoint.
- Create: `packages/franken-orchestrator/tests/unit/adapters/mcp-sdk-adapter.test.ts`
  Reason: prove the MCP adapter exposes a real tool catalog and delegates invocation instead of echoing JSON.
- Create: `packages/franken-orchestrator/tests/integration/cli/command-families.integration.test.ts`
  Reason: add one focused integration proof file covering `skill`, `security`, and command routing edges not already protected by dedicated integration tests.

---

### Task 1: Config And Flag Truthfulness

**Files:**
- Modify: `packages/franken-orchestrator/src/cli/args.ts`
- Modify: `packages/franken-orchestrator/src/cli/config-loader.ts`
- Modify: `packages/franken-orchestrator/src/cli/run-config-loader.ts`
- Modify: `packages/franken-orchestrator/src/cli/run.ts`
- Modify: `packages/franken-orchestrator/src/cli/session.ts`
- Modify: `packages/franken-orchestrator/tests/unit/cli/args.test.ts`
- Modify: `packages/franken-orchestrator/tests/unit/cli/config-loader.test.ts`
- Modify: `packages/franken-orchestrator/tests/unit/cli/config-loader-providers.test.ts`
- Modify: `packages/franken-orchestrator/tests/unit/cli/run.test.ts`
- Modify: `packages/franken-orchestrator/tests/unit/cli/session.test.ts`
- Create: `packages/franken-orchestrator/tests/integration/cli/run-config-surface.test.ts`

- [ ] **Step 1: Write the failing tests for provider precedence and config propagation**

```ts
// packages/franken-orchestrator/tests/unit/cli/args.test.ts
it('leaves provider undefined when --provider is omitted so config can supply the default', () => {
  const args = parseArgs(['run']);
  expect(args.provider).toBeUndefined();
});
```

```ts
// packages/franken-orchestrator/tests/integration/cli/run-config-surface.test.ts
it('uses config.providers.default when CLI omits --provider', async () => {
  const sessionSpy = vi.spyOn(Session.prototype, 'start').mockResolvedValue(undefined);
  await mainWithArgs(['run', '--config', fixturePath('provider-default-gemini.json')]);
  expect(sessionSpy).toHaveBeenCalled();
  expect(mockedSessionConfig().provider).toBe('gemini');
});

it('passes critique, heartbeat, tracing, duration, token, and reflection settings into Session', async () => {
  await mainWithArgs(['run', '--config', fixturePath('all-knobs.json')]);
  expect(mockedSessionConfig()).toMatchObject({
    maxCritiqueIterations: 5,
    maxDurationMs: 60_000,
    enableTracing: true,
    enableHeartbeat: true,
    minCritiqueScore: 0.82,
    maxTotalTokens: 120_000,
    enableReflection: true,
  });
});
```

- [ ] **Step 2: Run the focused tests and verify they fail for the right reason**

Run: `cd packages/franken-orchestrator && npm test -- --run tests/unit/cli/args.test.ts tests/unit/cli/config-loader.test.ts tests/unit/cli/config-loader-providers.test.ts tests/unit/cli/run.test.ts tests/unit/cli/session.test.ts tests/integration/cli/run-config-surface.test.ts`

Expected: FAIL because `parseArgs()` still forces `provider: 'claude'`, `config-loader.ts` only maps `--verbose` to tracing, and `Session.buildDepOptions()` drops most runtime config on the floor.

- [ ] **Step 3: Implement provider/config truthfulness end-to-end**

```ts
// packages/franken-orchestrator/src/cli/args.ts
export interface CliArgs {
  provider?: string | undefined;
  resume: boolean;
}

const provider = values.provider?.toLowerCase();

return {
  provider,
  resume: values.resume ?? false,
};
```

```ts
// packages/franken-orchestrator/src/cli/run.ts
const config = await resolveConfig(args);
const effectiveProvider = args.provider ?? config.providers.default;

const session = new Session({
  paths,
  baseBranch,
  budget: args.budget,
  provider: effectiveProvider,
  providers: args.providers ?? config.providers.fallbackChain,
  providersConfig: config.providers.overrides,
  maxCritiqueIterations: config.maxCritiqueIterations,
  maxDurationMs: config.maxDurationMs,
  enableTracing: config.enableTracing,
  enableHeartbeat: config.enableHeartbeat,
  enableReflection: config.enableReflection,
  minCritiqueScore: config.minCritiqueScore,
  maxTotalTokens: config.maxTotalTokens,
  resume: args.resume,
  noPr: args.noPr,
  verbose: args.verbose,
  reset: args.reset,
  io,
  entryPhase,
});
```

```ts
// packages/franken-orchestrator/src/cli/session.ts
private buildDepOptions(): CliDepOptions {
  return {
    paths: this.config.paths,
    baseBranch: this.config.baseBranch,
    budget: this.config.budget,
    provider: this.config.provider,
    providers: this.config.providers,
    providersConfig: this.config.providersConfig,
    noPr: this.config.noPr,
    verbose: this.config.verbose,
    reset: this.config.reset,
    resume: this.config.resume,
    planDirOverride: this.config.planDirOverride,
    critiqueMaxIterations: this.config.maxCritiqueIterations,
    critiqueConsensusThreshold: this.config.minCritiqueScore,
    orchestratorConfig: {
      maxDurationMs: this.config.maxDurationMs,
      enableTracing: this.config.enableTracing,
      enableHeartbeat: this.config.enableHeartbeat,
      enableReflection: this.config.enableReflection,
      maxTotalTokens: this.config.maxTotalTokens,
    } as import('../config/orchestrator-config.js').OrchestratorConfig,
    runConfig: loadRunConfigFromEnv(),
  };
}
```

- [ ] **Step 4: Add minimal config-loader support for the advertised live surface**

```ts
// packages/franken-orchestrator/src/cli/config-loader.ts
function fromCli(args: CliArgs): Partial<OrchestratorConfig> {
  const cli: Partial<OrchestratorConfig> = {};

  if (args.provider) {
    cli.providers = { default: args.provider };
  }
  if (args.verbose) {
    cli.enableTracing = true;
  }

  return cli;
}
```

- [ ] **Step 5: Re-run the focused tests and verify they pass**

Run: `cd packages/franken-orchestrator && npm test -- --run tests/unit/cli/args.test.ts tests/unit/cli/config-loader.test.ts tests/unit/cli/config-loader-providers.test.ts tests/unit/cli/run.test.ts tests/unit/cli/session.test.ts tests/integration/cli/run-config-surface.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/franken-orchestrator/src/cli/args.ts \
  packages/franken-orchestrator/src/cli/config-loader.ts \
  packages/franken-orchestrator/src/cli/run-config-loader.ts \
  packages/franken-orchestrator/src/cli/run.ts \
  packages/franken-orchestrator/src/cli/session.ts \
  packages/franken-orchestrator/tests/unit/cli/args.test.ts \
  packages/franken-orchestrator/tests/unit/cli/config-loader.test.ts \
  packages/franken-orchestrator/tests/unit/cli/config-loader-providers.test.ts \
  packages/franken-orchestrator/tests/unit/cli/run.test.ts \
  packages/franken-orchestrator/tests/unit/cli/session.test.ts \
  packages/franken-orchestrator/tests/integration/cli/run-config-surface.test.ts
git commit -m "fix(orchestrator): wire live beast config surface"
```

---

### Task 2: Required Dependency Hardening

**Files:**
- Modify: `packages/franken-orchestrator/src/cli/dep-factory.ts`
- Modify: `packages/franken-orchestrator/src/cli/create-beast-deps.ts`
- Modify: `packages/franken-orchestrator/tests/integration/cli/dep-factory-wiring.test.ts`
- Modify: `packages/franken-orchestrator/tests/unit/cli/create-beast-deps.test.ts`

- [ ] **Step 1: Write failing tests that reject permissive required-path fallback**

```ts
// packages/franken-orchestrator/tests/integration/cli/dep-factory-wiring.test.ts
it('throws when createBeastDeps fails instead of silently falling back to permissive stubs', async () => {
  vi.spyOn(createBeastDepsModule, 'createBeastDeps').mockImplementation(() => {
    throw new Error('brain bootstrap failed');
  });

  await expect(createCliDeps(baseOptions())).rejects.toThrow('brain bootstrap failed');
});

it('throws when critique is enabled but the critique module cannot be loaded', async () => {
  mockDynamicImport('@franken/critique', () => {
    throw new Error('module missing');
  });

  await expect(createCliDeps(baseOptions())).rejects.toThrow('module missing');
});
```

- [ ] **Step 2: Run the focused dependency tests and verify red**

Run: `cd packages/franken-orchestrator && GIT_AUTHOR_NAME=Codex GIT_AUTHOR_EMAIL=codex@example.com GIT_COMMITTER_NAME=Codex GIT_COMMITTER_EMAIL=codex@example.com npm test -- --run tests/integration/cli/dep-factory-wiring.test.ts tests/unit/cli/create-beast-deps.test.ts`

Expected: FAIL because `createCliDeps()` still logs warnings and falls back to permissive stub-like behavior.

- [ ] **Step 3: Replace required-path fallbacks with explicit failure**

```ts
// packages/franken-orchestrator/src/cli/dep-factory.ts
if (modules.critique) {
  const critiqueModule = await import('@franken/critique');
  // construct critique or let the import error escape
}

if (modules.governor) {
  const governorModule = await import('@franken/governor');
  // construct governor or let the import error escape
}

const consolidated = createBeastDeps(beastConfig, existingDeps);
```

```ts
// packages/franken-orchestrator/src/cli/create-beast-deps.ts
if (providers.length === 0) {
  throw new Error('No providers configured for beast mode');
}

if (!config.skillsDir) {
  throw new Error('skillsDir is required for live beast dependency assembly');
}
```

- [ ] **Step 4: Keep explicit opt-out behavior only where the user disabled a module**

```ts
// packages/franken-orchestrator/src/cli/dep-factory.ts
const critique = modules.critique
  ? await createCliCritique({
      paths,
      logger,
      observerBridge,
      budget,
      maxIterations: options.critiqueMaxIterations ?? 3,
      consensusThreshold: options.critiqueConsensusThreshold ?? 0.7,
    })
  : stubCritique;

const governor = modules.governor
  ? await createCliGovernor({
      paths,
      logger,
      stdin: process.stdin,
      stdout: process.stdout,
    })
  : stubGovernor;
```

- [ ] **Step 5: Re-run the focused dependency tests and verify green**

Run: `cd packages/franken-orchestrator && GIT_AUTHOR_NAME=Codex GIT_AUTHOR_EMAIL=codex@example.com GIT_COMMITTER_NAME=Codex GIT_COMMITTER_EMAIL=codex@example.com npm test -- --run tests/integration/cli/dep-factory-wiring.test.ts tests/unit/cli/create-beast-deps.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/franken-orchestrator/src/cli/dep-factory.ts \
  packages/franken-orchestrator/src/cli/create-beast-deps.ts \
  packages/franken-orchestrator/tests/integration/cli/dep-factory-wiring.test.ts \
  packages/franken-orchestrator/tests/unit/cli/create-beast-deps.test.ts
git commit -m "fix(orchestrator): harden required beast dependency assembly"
```

---

### Task 3: Resume And Checkpoint Semantics

**Files:**
- Modify: `packages/franken-orchestrator/src/cli/args.ts`
- Modify: `packages/franken-orchestrator/src/cli/run.ts`
- Modify: `packages/franken-orchestrator/src/cli/session.ts`
- Modify: `packages/franken-orchestrator/src/cli/dep-factory.ts`
- Modify: `packages/franken-orchestrator/tests/unit/cli/args.test.ts`
- Modify: `packages/franken-orchestrator/tests/unit/cli/session.test.ts`
- Modify: `packages/franken-orchestrator/tests/e2e/chunk-pipeline.test.ts`
- Create: `packages/franken-orchestrator/tests/integration/cli/run-resume.test.ts`

- [ ] **Step 1: Write the failing resume tests**

```ts
// packages/franken-orchestrator/tests/integration/cli/run-resume.test.ts
it('fails clearly when --resume is requested without a checkpoint', async () => {
  const result = await runCli(['run', '--resume'], { cwd: fixtureProject() });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('No checkpoint found for --resume');
});

it('uses the checkpoint path instead of a cold run when --resume is set', async () => {
  await writeCheckpoint(fixtureProject(), {
    completedTaskIds: ['impl:01_setup'],
    nextTaskId: 'harden:01_setup',
  });

  const result = await runCli(['run', '--resume', '--plan-dir', fixtureChunks()], { cwd: fixtureProject() });
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('Resuming from checkpoint');
  expect(result.stdout).not.toContain('taskId=impl:01_setup status=success');
});
```

- [ ] **Step 2: Verify the resume tests fail first**

Run: `cd packages/franken-orchestrator && env E2E=true npm test -- --run tests/integration/cli/run-resume.test.ts tests/e2e/chunk-pipeline.test.ts tests/unit/cli/session.test.ts`

Expected: FAIL because `args.resume` is not threaded into the main run path and there is no explicit resume/no-checkpoint behavior.

- [ ] **Step 3: Thread resume through the main execution path**

```ts
// packages/franken-orchestrator/src/cli/session.ts
export interface SessionConfig {
  resume: boolean;
}

private async runExecute(): Promise<BeastResult> {
  const { deps, logger, finalize } = await createCliDeps(this.buildDepOptions());

  if (this.config.resume) {
    const checkpointState = deps.checkpoint ? await deps.checkpoint.read() : undefined;
    if (!checkpointState) {
      throw new Error('No checkpoint found for --resume');
    }
    logger.info('Resuming from checkpoint', 'session');
  }

  // existing BeastLoop run follows
}
```

```ts
// packages/franken-orchestrator/src/cli/dep-factory.ts
export interface CliDepOptions {
  resume?: boolean | undefined;
}
```

- [ ] **Step 4: Make checkpoint expectations explicit in the E2E path**

```ts
// packages/franken-orchestrator/tests/e2e/chunk-pipeline.test.ts
expect(rawCheckpoint).toContain('impl:01_test_feature:impl:iter_1:commit_abc123');
expect(rawCheckpoint).toContain('harden:01_test_feature:harden:iter_1:commit_abc123');
expect(result.stdout).toContain('Resuming from checkpoint');
```

- [ ] **Step 5: Re-run the focused resume tests and verify green**

Run: `cd packages/franken-orchestrator && env E2E=true npm test -- --run tests/integration/cli/run-resume.test.ts tests/e2e/chunk-pipeline.test.ts tests/unit/cli/session.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/franken-orchestrator/src/cli/args.ts \
  packages/franken-orchestrator/src/cli/run.ts \
  packages/franken-orchestrator/src/cli/session.ts \
  packages/franken-orchestrator/src/cli/dep-factory.ts \
  packages/franken-orchestrator/tests/unit/cli/args.test.ts \
  packages/franken-orchestrator/tests/unit/cli/session.test.ts \
  packages/franken-orchestrator/tests/e2e/chunk-pipeline.test.ts \
  packages/franken-orchestrator/tests/integration/cli/run-resume.test.ts
git commit -m "fix(orchestrator): implement explicit beast resume semantics"
```

---

### Task 4: Skill, MCP, And Execution-Path Completeness

**Files:**
- Modify: `packages/franken-orchestrator/src/adapters/mcp-sdk-adapter.ts`
- Modify: `packages/franken-orchestrator/src/cli/create-beast-deps.ts`
- Modify: `packages/franken-orchestrator/src/cli/dep-factory.ts`
- Modify: `packages/franken-orchestrator/tests/unit/cli/skill-cli.test.ts`
- Create: `packages/franken-orchestrator/tests/unit/adapters/mcp-sdk-adapter.test.ts`

- [ ] **Step 1: Write the failing MCP adapter tests**

```ts
// packages/franken-orchestrator/tests/unit/adapters/mcp-sdk-adapter.test.ts
it('returns real available tools from the injected catalog', async () => {
  const adapter = new McpSdkAdapter({
    getAvailableTools: async () => [{ name: 'github.search', description: 'Search GitHub', inputSchema: { type: 'object' } }],
    callTool: async () => ({ content: 'ok', isError: false }),
  });

  await expect(adapter.getAvailableTools()).resolves.toEqual([
    expect.objectContaining({ name: 'github.search' }),
  ]);
});

it('delegates tool execution instead of echoing JSON', async () => {
  const callTool = vi.fn().mockResolvedValue({ content: 'search result', isError: false });
  const adapter = new McpSdkAdapter({
    getAvailableTools: async () => [],
    callTool,
  });

  const result = await adapter.callTool('github.search', { q: 'bug' });
  expect(callTool).toHaveBeenCalledWith('github.search', { q: 'bug' });
  expect(result.content).toBe('search result');
});
```

- [ ] **Step 2: Verify red**

Run: `cd packages/franken-orchestrator && npm test -- --run tests/unit/adapters/mcp-sdk-adapter.test.ts tests/unit/cli/skill-cli.test.ts tests/integration/cli/dep-factory-wiring.test.ts`

Expected: FAIL because `McpSdkAdapter` still returns a placeholder echo implementation and `create-beast-deps.ts` does not supply real tool source/invocation closures.

- [ ] **Step 3: Replace the placeholder MCP adapter with a real injected adapter**

```ts
// packages/franken-orchestrator/src/adapters/mcp-sdk-adapter.ts
export interface McpSdkAdapterDeps {
  getAvailableTools: () => Promise<readonly McpToolInfo[]>;
  callTool: (name: string, args: unknown) => Promise<McpToolCallResult>;
}

export class McpSdkAdapter implements IMcpModule {
  constructor(private readonly deps: McpSdkAdapterDeps) {}

  async callTool(name: string, args: unknown): Promise<McpToolCallResult> {
    return this.deps.callTool(name, args);
  }

  async getAvailableTools(): Promise<readonly McpToolInfo[]> {
    return this.deps.getAvailableTools();
  }
}
```

- [ ] **Step 4: Wire the real MCP adapter from live beast dependencies**

```ts
// packages/franken-orchestrator/src/cli/create-beast-deps.ts
const mcp = new McpSdkAdapter({
  getAvailableTools: async () => skillManager.listInstalled()
    .flatMap((skill) => skillManager.readTools(skill) ?? []),
  callTool: async (name, args) => registry.callMcpTool(name, args),
});
```

```ts
// packages/franken-orchestrator/src/cli/dep-factory.ts
const deps: BeastLoopDeps = {
  ...consolidated,
  skills,
  mcp: consolidated.mcp,
};
```

- [ ] **Step 5: Re-run the focused tests and verify green**

Run: `cd packages/franken-orchestrator && GIT_AUTHOR_NAME=Codex GIT_AUTHOR_EMAIL=codex@example.com GIT_COMMITTER_NAME=Codex GIT_COMMITTER_EMAIL=codex@example.com npm test -- --run tests/unit/adapters/mcp-sdk-adapter.test.ts tests/unit/cli/skill-cli.test.ts tests/integration/cli/dep-factory-wiring.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/franken-orchestrator/src/adapters/mcp-sdk-adapter.ts \
  packages/franken-orchestrator/src/cli/create-beast-deps.ts \
  packages/franken-orchestrator/src/cli/dep-factory.ts \
  packages/franken-orchestrator/tests/unit/adapters/mcp-sdk-adapter.test.ts \
  packages/franken-orchestrator/tests/unit/cli/skill-cli.test.ts \
  packages/franken-orchestrator/tests/integration/cli/dep-factory-wiring.test.ts
git commit -m "feat(orchestrator): wire real beast mcp execution path"
```

---

### Task 5: Command-Family Proof Pass

**Files:**
- Modify: `packages/franken-orchestrator/tests/e2e/cli-e2e.test.ts`
- Modify: `packages/franken-orchestrator/tests/integration/issues/issues-e2e.test.ts`
- Modify: `packages/franken-orchestrator/tests/integration/chat/chat-server.test.ts`
- Modify: `packages/franken-orchestrator/tests/integration/network/network-cli.test.ts`
- Modify: `packages/franken-orchestrator/tests/integration/beasts/beast-routes.test.ts`
- Modify: `packages/franken-orchestrator/tests/integration/beasts/agent-routes.test.ts`
- Create: `packages/franken-orchestrator/tests/integration/cli/command-families.integration.test.ts`
- Modify: `packages/franken-orchestrator/src/cli/run.ts`
- Modify: `packages/franken-orchestrator/src/cli/beast-cli.ts`
- Modify: `packages/franken-orchestrator/src/cli/beast-control-client.ts`

- [ ] **Step 1: Write the failing command-family proof tests**

```ts
// packages/franken-orchestrator/tests/integration/cli/command-families.integration.test.ts
it('skill list uses the live skill manager path', async () => {
  const result = await runCli(['skill', 'list'], { cwd: fixtureProject() });
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('Installed skills');
});

it('security status uses the live security-profile path', async () => {
  const result = await runCli(['security', 'status'], { cwd: fixtureProject() });
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('Current security profile');
});
```

```ts
// packages/franken-orchestrator/tests/e2e/cli-e2e.test.ts
it('runs the execute path to completion without hanging after closure', async () => {
  const result = await runCli(['run', '--plan-dir', fixtureChunks()], { cwd: fixtureProject(), timeout: 15_000 });
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('BUILD SUMMARY');
});
```

- [ ] **Step 2: Verify red**

Run: `cd packages/franken-orchestrator && env E2E=true npm test -- --run tests/e2e/cli-e2e.test.ts tests/integration/cli/command-families.integration.test.ts tests/integration/issues/issues-e2e.test.ts tests/integration/chat/chat-server.test.ts tests/integration/network/network-cli.test.ts tests/integration/beasts/beast-routes.test.ts tests/integration/beasts/agent-routes.test.ts`

Expected: FAIL on any remaining timeout, cleanup, routing, auth, or handler-assembly issues in the live command families.

- [ ] **Step 3: Fix command-family failures in the smallest surface-specific change**

```ts
// packages/franken-orchestrator/src/cli/run.ts
if (args.subcommand === 'skill') {
  const { skillManager } = await createCliDeps({
    paths,
    baseBranch: 'main',
    budget: args.budget,
    provider: args.provider ?? config.providers.default,
    providers: args.providers ?? config.providers.fallbackChain,
    providersConfig: config.providers.overrides,
    noPr: true,
    verbose: args.verbose,
    reset: false,
    orchestratorConfig: config,
  });
  await handleSkillCommand({ skillManager, action: args.skillAction, target: args.skillTarget, print: console.log });
  return;
}
```

```ts
// packages/franken-orchestrator/src/cli/run.ts
if (args.subcommand === 'security') {
  await handleSecurityCommand({
    action: args.securityAction,
    target: args.securityTarget,
    print: console.log,
  });
  return;
}
```

```ts
// packages/franken-orchestrator/src/cli/run.ts
process.off('SIGINT', sigintHandler);
await finalize();
```

- [ ] **Step 4: Re-run the command-family proof set and verify green**

Run: `cd packages/franken-orchestrator && env E2E=true npm test -- --run tests/e2e/cli-e2e.test.ts tests/integration/cli/command-families.integration.test.ts tests/integration/issues/issues-e2e.test.ts tests/integration/chat/chat-server.test.ts tests/integration/network/network-cli.test.ts tests/integration/beasts/beast-routes.test.ts tests/integration/beasts/agent-routes.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/cli/run.ts \
  packages/franken-orchestrator/src/cli/beast-cli.ts \
  packages/franken-orchestrator/src/cli/beast-control-client.ts \
  packages/franken-orchestrator/tests/e2e/cli-e2e.test.ts \
  packages/franken-orchestrator/tests/integration/cli/command-families.integration.test.ts \
  packages/franken-orchestrator/tests/integration/issues/issues-e2e.test.ts \
  packages/franken-orchestrator/tests/integration/chat/chat-server.test.ts \
  packages/franken-orchestrator/tests/integration/network/network-cli.test.ts \
  packages/franken-orchestrator/tests/integration/beasts/beast-routes.test.ts \
  packages/franken-orchestrator/tests/integration/beasts/agent-routes.test.ts
git commit -m "test(orchestrator): prove live beast command families"
```

---

### Task 6: Verification Matrix And Docs Alignment

**Files:**
- Modify: `packages/franken-orchestrator/package.json`
- Modify: `docs/guides/run-cli-beast.md`
- Modify: `docs/PROGRESS.md`
- Modify: `tasks/todo.md`

- [ ] **Step 1: Write the failing verification-script expectation**

```ts
// packages/franken-orchestrator/tests/unit/cli/run.test.ts
it('package.json exposes a beast surface verification script', () => {
  const pkg = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'));
  expect(pkg.scripts['test:beast-surface']).toBeDefined();
});
```

- [ ] **Step 2: Verify red**

Run: `cd packages/franken-orchestrator && npm test -- --run tests/unit/cli/run.test.ts`

Expected: FAIL because the curated verification script does not exist yet.

- [ ] **Step 3: Add the authoritative verification matrix**

```json
// packages/franken-orchestrator/package.json
{
  "scripts": {
    "test:beast-surface": "vitest run tests/integration/cli/run-config-surface.test.ts tests/integration/cli/run-resume.test.ts tests/integration/cli/dep-factory-wiring.test.ts tests/integration/cli/command-families.integration.test.ts tests/integration/issues/issues-e2e.test.ts tests/integration/chat/chat-server.test.ts tests/integration/network/network-cli.test.ts tests/integration/beasts/beast-routes.test.ts tests/integration/beasts/agent-routes.test.ts tests/e2e/cli-e2e.test.ts tests/e2e/chunk-pipeline.test.ts"
  }
}
```

````md
<!-- docs/guides/run-cli-beast.md -->
## Verification

Before calling beast mode release-ready, run:

```bash
cd packages/franken-orchestrator
env E2E=true npm run test:beast-surface
npm run typecheck
```
````

- [ ] **Step 4: Run the full verification matrix**

Run: `cd packages/franken-orchestrator && env E2E=true npm run test:beast-surface && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Record the evidence and mark the batch complete**

```md
<!-- tasks/todo.md -->
- [x] Write and approve the beast-mode hardening design spec covering the full live `franken-orchestrator` surface.
- [x] Write a concrete implementation plan for in-place beast hardening with TDD-first execution chunks.
- [x] Close config and flag no-op gaps on the live beast CLI surface.
- [x] Replace permissive module fallback behavior on required beast paths with real implementations or hard failures.
- [x] Implement explicit, tested resume semantics for the main beast `run` path.
- [x] Harden command-family execution paths for `run`, `issues`, `chat`, `chat-server`, `skill`, `security`, `network`, and `beasts`.
- [x] Make the beast verification matrix authoritative with passing focused integration and E2E coverage.
```

- [ ] **Step 6: Commit**

```bash
git add packages/franken-orchestrator/package.json \
  docs/guides/run-cli-beast.md \
  docs/PROGRESS.md \
  tasks/todo.md
git commit -m "docs(orchestrator): add beast hardening verification matrix"
```

---

## Self-Review

- Spec coverage: the six tasks map directly to the approved design chunks: config truthfulness, dependency hardening, resume semantics, MCP/skill completeness, command-family proof, and final verification/docs alignment.
- Placeholder scan: no `TBD`, `TODO`, “implement later”, or implicit “handle edge cases” steps remain in the plan.
- Type consistency: `CliArgs.provider` becomes optional, `SessionConfig.resume` is explicit, `CliDepOptions.resume` is explicit, and the new integration test files are referenced consistently across tasks.
