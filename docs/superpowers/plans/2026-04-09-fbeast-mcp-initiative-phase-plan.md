# fbeast MCP Initiative Phase Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `franken-mcp-suite` from solid scaffold into product-complete MCP initiative that matches design spec: real wrappers, working hooks, Beast Mode activation, integration coverage, and coherent install/release story.

**Architecture:** Keep `packages/franken-mcp-suite` as thin MCP transport and install surface. Push domain behavior into adapters that wrap existing franken packages and orchestrator modules instead of local stand-in logic. Do not reimplement core engines that already exist in `franken-brain`, `franken-planner`, `franken-critique`, `franken-governor`, `franken-observer`, or `franken-orchestrator`; only remove MCP-local stand-ins and wire those real modules. Validate each phase with focused unit tests first, then package integration tests, then end-to-end smoke checks around generated Claude config and spawned binaries.

**Tech Stack:** TypeScript, npm workspaces, `@modelcontextprotocol/sdk`, `better-sqlite3`, `vitest`, `gh`, franken-brain, franken-planner, franken-critique, franken-governor, franken-observer, franken-orchestrator

---

## File Structure

## Explicit Non-Goals

- Do not rewrite core planning, critique, memory, governor, observer, or orchestrator engines.
- Do not fork existing engine logic into `franken-mcp-suite`.
- Do not add new domain behavior to upstream packages unless adapter integration proves impossible.
- Only build MCP transport, adapter glue, CLI/install flow, hook runtime, and integration coverage inside this initiative.

### Existing files to modify

- Modify: `packages/franken-mcp-suite/package.json`
  Reason: align package name, bin entries, dependencies, release surface
- Modify: `packages/franken-mcp-suite/src/index.ts`
  Reason: export new adapter and CLI helpers
- Modify: `packages/franken-mcp-suite/src/beast.ts`
  Reason: reserve this file for combined MCP server only; avoid implying Beast Mode activation
- Modify: `packages/franken-mcp-suite/src/cli/init.ts`
  Reason: Claude config detection, relative DB args, hook install, package-aware setup
- Modify: `packages/franken-mcp-suite/src/cli/main.ts`
  Reason: route new commands cleanly
- Modify: `packages/franken-mcp-suite/src/cli/uninstall.ts`
  Reason: interactive purge prompt, hook cleanup, settings fallback behavior
- Modify: `packages/franken-mcp-suite/src/shared/config.ts`
  Reason: Beast Mode activation state, provider config, migration helpers
- Modify: `packages/franken-mcp-suite/src/servers/memory.ts`
  Reason: replace local SQL behavior with brain-backed adapter
- Modify: `packages/franken-mcp-suite/src/servers/planner.ts`
  Reason: replace template DAG with planner-backed behavior
- Modify: `packages/franken-mcp-suite/src/servers/critique.ts`
  Reason: replace regex heuristics with critique-backed evaluators
- Modify: `packages/franken-mcp-suite/src/servers/observer.ts`
  Reason: bridge to observer primitives, not only raw SQL summaries
- Modify: `packages/franken-mcp-suite/src/servers/governor.ts`
  Reason: route approvals/budget logic through governor package
- Modify: `packages/franken-mcp-suite/src/servers/firewall.ts`
  Reason: use orchestrator middleware rules instead of local regex set
- Modify: `packages/franken-mcp-suite/src/servers/skills.ts`
  Reason: use orchestrator skill manager / config store instead of raw DB table
- Modify: `README.md`
  Reason: MCP install and Beast Mode docs must match real package surface

### New files to create

- Create: `packages/franken-mcp-suite/src/adapters/brain-adapter.ts`
  Reason: isolate `franken-brain` integration and DB path translation
- Create: `packages/franken-mcp-suite/src/adapters/planner-adapter.ts`
  Reason: isolate `franken-planner` DAG generation/validation/export
- Create: `packages/franken-mcp-suite/src/adapters/critique-adapter.ts`
  Reason: isolate evaluator wiring and result normalization
- Create: `packages/franken-mcp-suite/src/adapters/governor-adapter.ts`
  Reason: isolate approval gateway and budget inspection wiring
- Create: `packages/franken-mcp-suite/src/adapters/observer-adapter.ts`
  Reason: isolate audit and cost APIs
- Create: `packages/franken-mcp-suite/src/adapters/firewall-adapter.ts`
  Reason: isolate orchestrator middleware chain scanning
- Create: `packages/franken-mcp-suite/src/adapters/skills-adapter.ts`
  Reason: isolate orchestrator skill manager reads
- Create: `packages/franken-mcp-suite/src/cli/hook.ts`
  Reason: provide real `fbeast-hook` command used by `--hooks`
- Create: `packages/franken-mcp-suite/src/cli/beast-mode.ts`
  Reason: Beast Mode activation command and provider-risk warning flow
- Create: `packages/franken-mcp-suite/src/cli/claude-config-paths.ts`
  Reason: project `.claude/` plus `~/.claude/` fallback detection
- Create: `packages/franken-mcp-suite/src/cli/prompt.ts`
  Reason: shared interactive prompts for purge and server picking
- Create: `packages/franken-mcp-suite/src/integration/init-uninstall.integration.test.ts`
  Reason: config injection/removal integration coverage
- Create: `packages/franken-mcp-suite/src/integration/server-startup.integration.test.ts`
  Reason: spawn each binary and validate MCP `tools/list`
- Create: `packages/franken-mcp-suite/src/integration/hook.integration.test.ts`
  Reason: verify installed hook command exists and produces expected gate/log behavior

---

### Task 1: Align Package And CLI Contract

**Files:**
- Modify: `packages/franken-mcp-suite/package.json`
- Modify: `packages/franken-mcp-suite/src/cli/main.ts`
- Modify: `packages/franken-mcp-suite/src/cli/init.ts`
- Modify: `packages/franken-mcp-suite/src/cli/uninstall.ts`
- Create: `packages/franken-mcp-suite/src/cli/claude-config-paths.ts`
- Create: `packages/franken-mcp-suite/src/cli/prompt.ts`
- Test: `packages/franken-mcp-suite/src/cli/init.test.ts`
- Test: `packages/franken-mcp-suite/src/cli/uninstall.test.ts`
- Test: `packages/franken-mcp-suite/src/integration/init-uninstall.integration.test.ts`

- [ ] **Step 1: Write failing tests for package/CLI contract**

```ts
it('falls back to home Claude config when project config missing', () => {
  const paths = resolveClaudeConfigPaths({
    cwd: '/tmp/project',
    homeDir: '/tmp/home',
    projectHasClaudeDir: false,
    homeHasClaudeDir: true,
  });

  expect(paths.claudeDir).toBe('/tmp/home/.claude');
});

it('prompts before purge when uninstall called without explicit decision', async () => {
  const answer = await resolvePurgeDecision(async () => 'y');
  expect(answer).toBe(true);
});
```

- [ ] **Step 2: Run targeted tests to verify red**

Run: `cd packages/franken-mcp-suite && npm test -- --run src/cli/init.test.ts src/cli/uninstall.test.ts src/integration/init-uninstall.integration.test.ts`

Expected: FAIL with missing config-path helper, missing purge prompt flow, and missing integration file

- [ ] **Step 3: Implement config-path and prompt helpers**

```ts
export function resolveClaudeConfigDir(input: {
  cwd: string;
  homeDir: string;
  exists: (path: string) => boolean;
}): string {
  const projectDir = join(input.cwd, '.claude');
  if (input.exists(projectDir)) return projectDir;
  return join(input.homeDir, '.claude');
}

export async function confirmYesNo(
  question: string,
  ask: (question: string) => Promise<string>,
): Promise<boolean> {
  const answer = (await ask(question)).trim().toLowerCase();
  return answer === 'y' || answer === 'yes';
}
```

- [ ] **Step 4: Update CLI surface to match spec**

```ts
// package.json
"name": "@fbeast/mcp-suite",
"bin": {
  "fbeast": "./dist/cli/main.js",
  "fbeast-mcp": "./dist/beast.js",
  "fbeast-hook": "./dist/cli/hook.js",
  "fbeast-init": "./dist/cli/init.js",
  "fbeast-uninstall": "./dist/cli/uninstall.js"
}

// main.ts
case 'beast': {
  const { runBeastMode } = await import('./beast-mode.js');
  await runBeastMode(process.argv.slice(3));
  break;
}
```

- [ ] **Step 5: Add init/uninstall integration test**

```ts
it('writes settings to fallback Claude dir and removes them on uninstall', async () => {
  const root = makeTmpProject();
  const home = makeTmpHome();

  runInit({ root, claudeDir: join(home, '.claude'), hooks: false, servers: ['memory'] });
  const settings = readJson(join(home, '.claude', 'settings.json'));
  expect(settings.mcpServers['fbeast-memory']).toBeDefined();

  runUninstall({ root, claudeDir: join(home, '.claude'), purge: true });
  const after = readJson(join(home, '.claude', 'settings.json'));
  expect(after.mcpServers['fbeast-memory']).toBeUndefined();
});
```

- [ ] **Step 6: Run verification**

Run: `cd packages/franken-mcp-suite && npm test -- --run src/cli/init.test.ts src/cli/uninstall.test.ts src/integration/init-uninstall.integration.test.ts && npm run typecheck`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/franken-mcp-suite/package.json packages/franken-mcp-suite/src/cli packages/franken-mcp-suite/src/integration/init-uninstall.integration.test.ts
git commit -m "feat(mcp-suite): align cli install contract with published package story"
```

---

### Task 2: Replace Memory, Observer, And Governor MCP Stand-ins With Adapter Calls To Existing Engines

**Files:**
- Create: `packages/franken-mcp-suite/src/adapters/brain-adapter.ts`
- Create: `packages/franken-mcp-suite/src/adapters/observer-adapter.ts`
- Create: `packages/franken-mcp-suite/src/adapters/governor-adapter.ts`
- Modify: `packages/franken-mcp-suite/src/servers/memory.ts`
- Modify: `packages/franken-mcp-suite/src/servers/observer.ts`
- Modify: `packages/franken-mcp-suite/src/servers/governor.ts`
- Modify: `packages/franken-mcp-suite/src/index.ts`
- Test: `packages/franken-mcp-suite/src/servers/memory.test.ts`
- Test: `packages/franken-mcp-suite/src/servers/observer.test.ts`
- Test: `packages/franken-mcp-suite/src/servers/governor.test.ts`

- [ ] **Step 1: Write failing adapter-focused tests**

```ts
it('memory server delegates query/store/frontload/forget to brain adapter', async () => {
  const brain = fakeBrainAdapter();
  const server = createMemoryServer({ brain });

  await tool(server, 'fbeast_memory_store', { key: 'k', value: 'v', type: 'working' });
  expect(brain.store).toHaveBeenCalledWith({ key: 'k', value: 'v', type: 'working' });
});

it('governor server returns real gateway decision shape', async () => {
  const governor = fakeGovernorAdapter({ decision: 'approved', reason: 'safe' });
  const server = createGovernorServer({ governor });
  const result = await tool(server, 'fbeast_governor_check', { action: 'edit_file', context: '{}' });
  expect(text(result)).toContain('approved');
});
```

- [ ] **Step 2: Run tests to verify red**

Run: `cd packages/franken-mcp-suite && npm test -- --run src/servers/memory.test.ts src/servers/observer.test.ts src/servers/governor.test.ts`

Expected: FAIL with missing adapters and constructor changes

- [ ] **Step 3: Implement thin adapters over existing packages only**

```ts
// brain-adapter.ts
import { SqliteBrain } from 'franken-brain';

export function createBrainAdapter(dbPath: string) {
  const brain = new SqliteBrain({ dbPath });
  return {
    query(input) { return brain.search(input.query, { type: input.type, limit: input.limit }); },
    store(input) { return brain.remember(input.key, input.value, input.type); },
    frontload(projectId) { return brain.frontload(projectId); },
    forget(key) { return brain.forget(key); },
  };
}
```

```ts
// governor-adapter.ts
import { createGovernor } from '@franken/governor';

export function createGovernorAdapter(config: GovernorConfig) {
  const gateway = createGovernor(config);
  return {
    async check(action: string, context: string) {
      return gateway.evaluate({ action, context: JSON.parse(context) });
    },
    async budgetStatus() {
      return gateway.getBudgetStatus();
    },
  };
}
```

- [ ] **Step 4: Refactor servers to consume adapters**

```ts
export function createMemoryServer(deps: { brain: BrainAdapter }): FbeastMcpServer {
  return createMcpServer('fbeast-memory', '0.1.0', [
    {
      name: 'fbeast_memory_query',
      async handler(args) {
        const rows = await deps.brain.query({
          query: String(args['query']),
          type: args['type'] ? String(args['type']) : undefined,
          limit: args['limit'] ? Number(args['limit']) : 20,
        });
        return toTextResult(rows);
      },
    },
  ]);
}
```

- [ ] **Step 5: Run verification**

Run: `cd packages/franken-mcp-suite && npm test -- --run src/servers/memory.test.ts src/servers/observer.test.ts src/servers/governor.test.ts && npm run typecheck`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/franken-mcp-suite/src/adapters packages/franken-mcp-suite/src/servers/memory.ts packages/franken-mcp-suite/src/servers/observer.ts packages/franken-mcp-suite/src/servers/governor.ts packages/franken-mcp-suite/src/index.ts
git commit -m "feat(mcp-suite): wire memory observer and governor to real adapters"
```

---

### Task 3: Replace Planner And Critique MCP Stand-ins With Adapter Calls To Existing Engines

**Files:**
- Create: `packages/franken-mcp-suite/src/adapters/planner-adapter.ts`
- Create: `packages/franken-mcp-suite/src/adapters/critique-adapter.ts`
- Modify: `packages/franken-mcp-suite/src/servers/planner.ts`
- Modify: `packages/franken-mcp-suite/src/servers/critique.ts`
- Test: `packages/franken-mcp-suite/src/servers/planner.test.ts`
- Test: `packages/franken-mcp-suite/src/servers/critique.test.ts`

- [ ] **Step 1: Write failing tests for real planner/critique delegation**

```ts
it('planner server stores adapter-generated DAG instead of fixed template', async () => {
  const planner = fakePlannerAdapter({
    planId: 'plan-1',
    dag: { objective: 'ship', tasks: [{ id: 'a', title: 'real task', deps: [] }] },
  });

  const server = createPlannerServer({ planner, store });
  const result = await tool(server, 'fbeast_plan_decompose', { objective: 'ship' });
  expect(text(result)).toContain('real task');
});

it('critique server uses external evaluators when criteria omitted', async () => {
  const critique = fakeCritiqueAdapter({ verdict: 'warn', score: 0.7, findings: [{ severity: 'warning', message: 'x' }] });
  const server = createCritiqueServer({ critique });
  const result = await tool(server, 'fbeast_critique_evaluate', { content: 'const x = 1' });
  expect(text(result)).toContain('0.70');
});
```

- [ ] **Step 2: Run tests to verify red**

Run: `cd packages/franken-mcp-suite && npm test -- --run src/servers/planner.test.ts src/servers/critique.test.ts`

Expected: FAIL with missing adapters and fixed-template assumptions

- [ ] **Step 3: Implement planner and critique adapters only**

```ts
// planner-adapter.ts
import { Planner, PlanExporter } from 'franken-planner';

export function createPlannerAdapter() {
  const planner = new Planner();
  const exporter = new PlanExporter();
  return {
    async decompose(input) {
      const dag = await planner.plan({ objective: input.objective, constraints: input.constraints });
      return { planId: dag.id, dag, mermaid: exporter.toMermaid(dag) };
    },
    validate(dag) {
      return planner.validate(dag);
    },
  };
}
```

```ts
// critique-adapter.ts
import { CritiqueLoop, FactualityEvaluator, SafetyEvaluator } from '@franken/critique';

export function createCritiqueAdapter() {
  const loop = new CritiqueLoop({
    evaluators: [new FactualityEvaluator(), new SafetyEvaluator()],
  });
  return {
    async evaluate(content: string, criteria?: string[]) {
      return loop.evaluate({ content, criteria });
    },
    async compare(original: string, revised: string) {
      return loop.compare({ original, revised });
    },
  };
}
```

- [ ] **Step 4: Refactor servers to normalize adapter output**

```ts
const evaluation = await deps.critique.evaluate(content, criteria);
return {
  content: [{
    type: 'text',
    text: renderCritique(evaluation),
  }],
};
```

- [ ] **Step 5: Run verification**

Run: `cd packages/franken-mcp-suite && npm test -- --run src/servers/planner.test.ts src/servers/critique.test.ts && npm run typecheck`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/franken-mcp-suite/src/adapters/planner-adapter.ts packages/franken-mcp-suite/src/adapters/critique-adapter.ts packages/franken-mcp-suite/src/servers/planner.ts packages/franken-mcp-suite/src/servers/critique.ts
git commit -m "feat(mcp-suite): replace planner and critique stand-ins with real engines"
```

---

### Task 4: Replace Firewall And Skills MCP Stand-ins With Orchestrator Adapters, Add Working Hook Binary

**Files:**
- Create: `packages/franken-mcp-suite/src/adapters/firewall-adapter.ts`
- Create: `packages/franken-mcp-suite/src/adapters/skills-adapter.ts`
- Create: `packages/franken-mcp-suite/src/cli/hook.ts`
- Modify: `packages/franken-mcp-suite/src/servers/firewall.ts`
- Modify: `packages/franken-mcp-suite/src/servers/skills.ts`
- Modify: `packages/franken-mcp-suite/package.json`
- Test: `packages/franken-mcp-suite/src/servers/firewall.test.ts`
- Test: `packages/franken-mcp-suite/src/servers/skills.test.ts`
- Test: `packages/franken-mcp-suite/src/integration/hook.integration.test.ts`

- [ ] **Step 1: Write failing tests for real firewall/skills integration and hook runtime**

```ts
it('hook binary exits nonzero when governor blocks tool call', async () => {
  const result = await runHook(['pre-tool', 'git-reset'], { FBEAST_DB: testDbPath });
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain('review_recommended');
});

it('skills discover delegates to skill manager registry', async () => {
  const skills = fakeSkillsAdapter([{ id: 'brainstorming', description: 'plan first' }]);
  const server = createSkillsServer({ skills });
  const result = await tool(server, 'fbeast_skills_discover', { query: 'brain' });
  expect(text(result)).toContain('brainstorming');
});
```

- [ ] **Step 2: Run tests to verify red**

Run: `cd packages/franken-mcp-suite && npm test -- --run src/servers/firewall.test.ts src/servers/skills.test.ts src/integration/hook.integration.test.ts`

Expected: FAIL with missing adapters and missing `fbeast-hook`

- [ ] **Step 3: Implement adapters over orchestrator middleware and skill manager**

```ts
import { MiddlewareFirewallAdapter } from 'franken-orchestrator';
import { SkillManagerAdapter } from 'franken-orchestrator';

export function createFirewallAdapter() {
  const firewall = new MiddlewareFirewallAdapter();
  return {
    scan(input: string) {
      return firewall.scan(input);
    },
    scanFile(path: string) {
      return firewall.scanFile(path);
    },
  };
}
```

- [ ] **Step 4: Implement hook binary**

```ts
switch (phase) {
  case 'pre-tool': {
    const decision = await governor.check(toolName, JSON.stringify({ phase: 'preToolCall' }));
    process.stderr.write(`${decision.decision}: ${decision.reason}\n`);
    process.exit(decision.decision === 'approved' ? 0 : 1);
  }
  case 'post-tool': {
    await observer.log('tool_result', JSON.stringify({ toolName, result }), sessionId);
    process.exit(0);
  }
}
```

- [ ] **Step 5: Run verification**

Run: `cd packages/franken-mcp-suite && npm test -- --run src/servers/firewall.test.ts src/servers/skills.test.ts src/integration/hook.integration.test.ts && npm run typecheck`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/franken-mcp-suite/package.json packages/franken-mcp-suite/src/adapters/firewall-adapter.ts packages/franken-mcp-suite/src/adapters/skills-adapter.ts packages/franken-mcp-suite/src/cli/hook.ts packages/franken-mcp-suite/src/servers/firewall.ts packages/franken-mcp-suite/src/servers/skills.ts packages/franken-mcp-suite/src/integration/hook.integration.test.ts
git commit -m "feat(mcp-suite): add working hooks and real firewall skills adapters"
```

---

### Task 5: Implement Beast Mode Activation And Shared-State Flow

**Files:**
- Create: `packages/franken-mcp-suite/src/cli/beast-mode.ts`
- Modify: `packages/franken-mcp-suite/src/cli/main.ts`
- Modify: `packages/franken-mcp-suite/src/shared/config.ts`
- Modify: `packages/franken-mcp-suite/src/beast.ts`
- Test: `packages/franken-mcp-suite/src/shared/config.test.ts`
- Test: `packages/franken-mcp-suite/src/integration/server-startup.integration.test.ts`

- [ ] **Step 1: Write failing tests for Beast Mode config and warning flow**

```ts
it('requires explicit acknowledgment before claude-cli provider', async () => {
  const cfg = FbeastConfig.init(tmpRoot());
  const decision = await resolveProviderRisk(cfg, 'claude-cli', async () => 'n');
  expect(decision.allowed).toBe(false);
  expect(cfg.beast.acknowledged_cli_risk).toBe(false);
});

it('starts Beast Mode using configured provider after acknowledgment', async () => {
  const result = await runBeastMode(['--provider=anthropic-api'], { root, startBeastLoop: fakeStart });
  expect(fakeStart).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to verify red**

Run: `cd packages/franken-mcp-suite && npm test -- --run src/shared/config.test.ts src/integration/server-startup.integration.test.ts`

Expected: FAIL with missing Beast Mode CLI and risk helper

- [ ] **Step 3: Implement Beast Mode CLI**

```ts
export async function runBeastMode(argv: string[], deps = defaultDeps): Promise<void> {
  const provider = parseProvider(argv);
  const cfg = FbeastConfig.load(deps.root);

  if (provider === 'claude-cli' && !cfg.beast.acknowledged_cli_risk) {
    const allowed = await deps.confirmRisk(CLI_RISK_WARNING);
    if (!allowed) return;
    cfg.beast.acknowledged_cli_risk = true;
  }

  cfg.mode = 'beast';
  cfg.beast.enabled = true;
  cfg.beast.provider = provider;
  cfg.save();
  await deps.startBeastLoop({ provider, dbPath: cfg.dbPath });
}
```

- [ ] **Step 4: Clarify combined MCP entrypoint naming**

```ts
// beast.ts
const server = createMcpServer('fbeast-mcp', '0.1.0', allTools);
```

Use `beast-mode.ts` for Beast Mode activation, keep `beast.ts` strictly combined MCP stdio server.

- [ ] **Step 5: Run verification**

Run: `cd packages/franken-mcp-suite && npm test -- --run src/shared/config.test.ts src/integration/server-startup.integration.test.ts && npm run typecheck`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/franken-mcp-suite/src/cli/beast-mode.ts packages/franken-mcp-suite/src/cli/main.ts packages/franken-mcp-suite/src/shared/config.ts packages/franken-mcp-suite/src/beast.ts packages/franken-mcp-suite/src/integration/server-startup.integration.test.ts
git commit -m "feat(mcp-suite): add beast mode activation and provider risk flow"
```

---

### Task 6: End-To-End Integration, Docs, And Release Readiness

**Files:**
- Create: `packages/franken-mcp-suite/src/integration/server-startup.integration.test.ts`
- Modify: `README.md`
- Modify: `packages/franken-mcp-suite/package.json`
- Modify: `.github/workflows/*` if package-specific publish/build matrix needed

- [ ] **Step 1: Write failing integration test for spawned MCP tools**

```ts
it('combined MCP server exposes expected tool names over stdio', async () => {
  const proc = spawn('node', ['dist/beast.js', '--db', testDbPath], { cwd: packageRoot });
  const client = await connectMcp(proc);
  const tools = await client.listTools();
  expect(tools.map((t) => t.name)).toContain('fbeast_memory_query');
  expect(tools.map((t) => t.name)).toContain('fbeast_governor_check');
});
```

- [ ] **Step 2: Run test to verify red**

Run: `cd packages/franken-mcp-suite && npm test -- --run src/integration/server-startup.integration.test.ts`

Expected: FAIL until built binaries and harness exist

- [ ] **Step 3: Implement integration harness and doc refresh**

```md
## MCP Mode

```bash
npx @fbeast/mcp-suite init --pick --hooks
```

- installs selected MCP servers into `.claude/settings.json`
- writes `.claude/fbeast-instructions.md`
- creates `.fbeast/beast.db`

## Beast Mode

```bash
fbeast beast --provider=anthropic-api
```
```

- [ ] **Step 4: Run full package verification**

Run: `cd packages/franken-mcp-suite && npm run typecheck && npm test && npm pack --dry-run`

Expected:
- `typecheck`: PASS
- `test`: PASS
- `npm pack --dry-run`: package contains dist + instructions + expected bins

- [ ] **Step 5: Run manual smoke checklist**

Run:
- `npm run build`
- `node dist/cli/main.js init --pick=memory,critique`
- inspect generated `.claude/settings.json`
- `node dist/cli/hook.js pre-tool delete-file`
- `node dist/cli/main.js uninstall --purge`

Expected:
- config written correctly
- hook binary exists and returns meaningful decision
- uninstall removes config and stored state

- [ ] **Step 6: Commit**

```bash
git add README.md packages/franken-mcp-suite/src/integration packages/franken-mcp-suite/package.json
git commit -m "docs(mcp-suite): add end-to-end coverage and release readiness updates"
```

---

## Self-Review

- **Spec coverage:** package/install contract, real wrappers, hook runtime, Beast Mode activation, integration tests, docs/release all mapped to tasks above.
- **Known deliberate split:** work stays inside `franken-mcp-suite` plus root docs/release surfaces. No unrelated orchestrator refactors.
- **Gap check:** if implementation reveals internal package API mismatch, first deliver adapter shims rather than reworking upstream packages directly.

## Recommended Execution Order

1. Task 1
2. Task 2
3. Task 3
4. Task 4
5. Task 5
6. Task 6

## Success Criteria

- `@fbeast/mcp-suite` install story and actual package surface match
- all 7 MCP servers use real franken/orchestrator integrations
- `fbeast-hook` exists and works with `--hooks`
- Beast Mode activation works with provider-risk acknowledgment
- package has integration coverage for config injection and MCP startup
- docs and release surface match shipped commands

Plan complete and saved to `docs/superpowers/plans/2026-04-09-fbeast-mcp-initiative-phase-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
