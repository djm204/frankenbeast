# fbeast Dual-Mode Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a first live release where `@fbeast/mcp-suite` provides a real MCP/plugin mode and Beast mode remains a standalone orchestrator path with dashboard-first control plus CLI parity for terminal users.

**Architecture:** Keep `packages/franken-mcp-suite` as thin transport, install, and mode-activation glue. Move MCP behavior behind adapter files that call existing franken engines and orchestrator surfaces instead of local stand-ins. Keep Beast runtime in `packages/franken-orchestrator`; use its existing Beast services and `/v1/beasts/*` contract for CLI parity, then let `fbeast beast` persist shared config and hand off to the orchestrator surfaces rather than recreating Beast logic in the MCP package.

**Tech Stack:** TypeScript, npm workspaces, `@modelcontextprotocol/sdk`, `better-sqlite3`, `vitest`, Hono, `franken-brain`, `franken-planner`, `@franken/critique`, `@franken/governor`, `@frankenbeast/observer`, `franken-orchestrator`, `franken-web`

---

## File Structure

### Existing files to modify

- Modify: `packages/franken-mcp-suite/package.json`
  Reason: expose real bin surface for hook/runtime activation and tighten release-facing scripts
- Modify: `packages/franken-mcp-suite/src/index.ts`
  Reason: export adapter and Beast activation helpers from package root
- Modify: `packages/franken-mcp-suite/src/cli/main.ts`
  Reason: route `init`, `uninstall`, and new `beast` activation entry cleanly
- Modify: `packages/franken-mcp-suite/src/cli/init.ts`
  Reason: install only working MCP servers/hooks and normalize config writes
- Modify: `packages/franken-mcp-suite/src/shared/config.ts`
  Reason: persist Beast activation/provider/risk state intentionally
- Modify: `packages/franken-mcp-suite/src/servers/memory.ts`
  Reason: replace direct SQL logic with brain adapter calls
- Modify: `packages/franken-mcp-suite/src/servers/observer.ts`
  Reason: replace local summaries with observer adapter calls
- Modify: `packages/franken-mcp-suite/src/servers/governor.ts`
  Reason: replace regex-only approvals with governor adapter calls
- Modify: `packages/franken-mcp-suite/src/servers/planner.ts`
  Reason: replace template DAG generation with planner adapter calls
- Modify: `packages/franken-mcp-suite/src/servers/critique.ts`
  Reason: replace heuristic critique logic with critique adapter calls
- Modify: `packages/franken-mcp-suite/src/servers/firewall.ts`
  Reason: replace local regex firewall rules with orchestrator-backed scanning
- Modify: `packages/franken-mcp-suite/src/servers/skills.ts`
  Reason: replace raw `skill_state` reads with orchestrator skill-manager backed adapter reads
- Modify: `packages/franken-orchestrator/src/cli/args.ts`
  Reason: add Beast CLI parity actions and keep usage text aligned
- Modify: `packages/franken-orchestrator/src/cli/beast-cli.ts`
  Reason: add `resume` and `delete` parity and centralize Beast control operations
- Modify: `packages/franken-orchestrator/src/cli/run.ts`
  Reason: keep command routing aligned with updated Beast CLI actions
- Modify: `packages/franken-web/README.md`
  Reason: dashboard docs must reflect Beast operator role in launch
- Modify: `README.md`
  Reason: root docs must stop claiming prototype status if release gate passes
- Modify: `tasks/todo.md`
  Reason: point tracking at this chunked execution plan

### New files to create

- Create: `packages/franken-mcp-suite/src/adapters/brain-adapter.ts`
  Reason: isolate `franken-brain` integration and shared DB path translation
- Create: `packages/franken-mcp-suite/src/adapters/observer-adapter.ts`
  Reason: isolate observer/cost/audit calls away from MCP handlers
- Create: `packages/franken-mcp-suite/src/adapters/governor-adapter.ts`
  Reason: isolate approval/budget logic behind a stable MCP-facing interface
- Create: `packages/franken-mcp-suite/src/adapters/planner-adapter.ts`
  Reason: isolate planner graph generation and validation
- Create: `packages/franken-mcp-suite/src/adapters/critique-adapter.ts`
  Reason: isolate critique evaluation/compare calls
- Create: `packages/franken-mcp-suite/src/adapters/firewall-adapter.ts`
  Reason: isolate orchestrator middleware scanning
- Create: `packages/franken-mcp-suite/src/adapters/skills-adapter.ts`
  Reason: isolate skill-manager/discovery access
- Create: `packages/franken-mcp-suite/src/cli/hook.ts`
  Reason: provide a real `fbeast-hook` binary for `--hooks`
- Create: `packages/franken-mcp-suite/src/cli/beast-mode.ts`
  Reason: persist Beast provider/risk config and hand off to orchestrator mode
- Create: `packages/franken-mcp-suite/src/cli/beast-mode.test.ts`
  Reason: lock down activation flow and risk acknowledgment behavior
- Create: `packages/franken-mcp-suite/src/integration/server-startup.integration.test.ts`
  Reason: smoke-check all declared MCP binaries and combined server startup
- Create: `packages/franken-mcp-suite/src/integration/hook.integration.test.ts`
  Reason: verify installed hooks execute real pre/post behavior
- Create: `packages/franken-mcp-suite/src/integration/dual-mode.integration.test.ts`
  Reason: verify shared `.fbeast` state survives MCP-to-Beast handoff
- Create: `packages/franken-orchestrator/src/cli/beast-control-client.ts`
  Reason: isolate Beast run/agent operations behind one CLI-facing client
- Create: `packages/franken-orchestrator/tests/unit/cli/beast-cli.test.ts`
  Reason: verify new Beast CLI parity actions in a focused file

---

### Task 1: MCP Contract And Smoke Harness

**Files:**
- Modify: `packages/franken-mcp-suite/package.json`
- Modify: `packages/franken-mcp-suite/src/index.ts`
- Modify: `packages/franken-mcp-suite/src/cli/main.ts`
- Modify: `packages/franken-mcp-suite/src/cli/init.ts`
- Create: `packages/franken-mcp-suite/src/cli/hook.ts`
- Create: `packages/franken-mcp-suite/src/integration/server-startup.integration.test.ts`
- Test: `packages/franken-mcp-suite/src/cli/init.test.ts`
- Test: `packages/franken-mcp-suite/src/integration/init-uninstall.integration.test.ts`
- Test: `packages/franken-mcp-suite/src/integration/server-startup.integration.test.ts`

- [ ] **Step 1: Write failing startup and bin-surface tests**

```ts
// packages/franken-mcp-suite/src/integration/server-startup.integration.test.ts
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const DIST = join(process.cwd(), 'dist');

describe('declared MCP binaries', () => {
  it('exposes a real fbeast-hook binary entry', () => {
    const pkg = require('../package.json');
    expect(pkg.bin['fbeast-hook']).toBe('./dist/cli/hook.js');
  });

  it('starts combined fbeast-mcp and returns a stdio handshake frame', () => {
    const result = spawnSync('node', [join(DIST, 'beast.js'), '--db', '.fbeast/test.db'], {
      input: '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}\n',
      encoding: 'utf8',
      timeout: 2000,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('fbeast_memory_query');
  });
});
```

- [ ] **Step 2: Run targeted tests to verify red**

Run: `cd packages/franken-mcp-suite && npm test -- --run src/cli/init.test.ts src/integration/init-uninstall.integration.test.ts src/integration/server-startup.integration.test.ts`

Expected: FAIL because `fbeast-hook` is missing from `package.json`, `src/cli/hook.ts` does not exist, and the startup integration test file is new.

- [ ] **Step 3: Add the real contract surface and a minimal hook binary**

```ts
// packages/franken-mcp-suite/src/cli/hook.ts
#!/usr/bin/env node
import { parseArgs } from 'node:util';

export async function runHook(argv: string[] = process.argv.slice(2)): Promise<void> {
  const { positionals } = parseArgs({ args: argv, allowPositionals: true, strict: false });
  const phase = positionals[0];

  if (phase !== 'pre-tool' && phase !== 'post-tool') {
    throw new Error('Usage: fbeast-hook <pre-tool|post-tool> ...');
  }

  // Real behavior lands in Task 4; this chunk only makes the binary installable.
  process.stdout.write(JSON.stringify({ phase, ok: true }) + '\n');
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMain) {
  runHook().catch((error) => {
    console.error('fbeast-hook failed:', error);
    process.exit(1);
  });
}
```

```json
// packages/franken-mcp-suite/package.json
{
  "bin": {
    "fbeast": "./dist/cli/main.js",
    "fbeast-mcp": "./dist/beast.js",
    "fbeast-hook": "./dist/cli/hook.js",
    "fbeast-memory": "./dist/servers/memory.js",
    "fbeast-planner": "./dist/servers/planner.js",
    "fbeast-critique": "./dist/servers/critique.js",
    "fbeast-firewall": "./dist/servers/firewall.js",
    "fbeast-observer": "./dist/servers/observer.js",
    "fbeast-governor": "./dist/servers/governor.js",
    "fbeast-skills": "./dist/servers/skills.js",
    "fbeast-init": "./dist/cli/init.js",
    "fbeast-uninstall": "./dist/cli/uninstall.js"
  }
}
```

- [ ] **Step 4: Add a startup smoke harness that proves the declared binaries really launch**

```ts
// packages/franken-mcp-suite/src/integration/server-startup.integration.test.ts
const SERVER_BINS = [
  ['memory', 'servers/memory.js', 'fbeast_memory_query'],
  ['planner', 'servers/planner.js', 'fbeast_plan_decompose'],
  ['critique', 'servers/critique.js', 'fbeast_critique_evaluate'],
  ['firewall', 'servers/firewall.js', 'fbeast_firewall_scan'],
  ['observer', 'servers/observer.js', 'fbeast_observer_log'],
  ['governor', 'servers/governor.js', 'fbeast_governor_check'],
  ['skills', 'servers/skills.js', 'fbeast_skills_list'],
] as const;

for (const [name, relPath, expectedTool] of SERVER_BINS) {
  it(`starts ${name} and exposes ${expectedTool}`, () => {
    const result = spawnSync('node', [join(DIST, relPath), '--db', '.fbeast/test.db'], {
      input: '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}\n',
      encoding: 'utf8',
      timeout: 2000,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(expectedTool);
  });
}
```

- [ ] **Step 5: Verify the chunk**

Run: `cd packages/franken-mcp-suite && npm test -- --run src/cli/init.test.ts src/integration/init-uninstall.integration.test.ts src/integration/server-startup.integration.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/franken-mcp-suite/package.json \
  packages/franken-mcp-suite/src/index.ts \
  packages/franken-mcp-suite/src/cli/main.ts \
  packages/franken-mcp-suite/src/cli/init.ts \
  packages/franken-mcp-suite/src/cli/hook.ts \
  packages/franken-mcp-suite/src/integration/server-startup.integration.test.ts
git commit -m "feat(mcp-suite): align mcp contract and startup smoke harness"
```

---

### Task 2: Memory, Observer, And Governor Adapter Chunk

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

- [ ] **Step 1: Write failing adapter-first tests**

```ts
// packages/franken-mcp-suite/src/servers/memory.test.ts
it('delegates memory store/query/frontload/forget to the brain adapter', async () => {
  const brain = {
    query: vi.fn().mockResolvedValue([{ key: 'adr', value: 'use adapters', type: 'working' }]),
    store: vi.fn().mockResolvedValue(undefined),
    frontload: vi.fn().mockResolvedValue([{ type: 'working', entries: ['adr: use adapters'] }]),
    forget: vi.fn().mockResolvedValue(true),
  };

  const server = createMemoryServer({ brain });
  await tool(server, 'fbeast_memory_store', { key: 'adr', value: 'use adapters', type: 'working' });
  expect(brain.store).toHaveBeenCalledWith({ key: 'adr', value: 'use adapters', type: 'working' });
});
```

```ts
// packages/franken-mcp-suite/src/servers/governor.test.ts
it('uses the governor adapter for approvals', async () => {
  const governor = {
    check: vi.fn().mockResolvedValue({ decision: 'approved', reason: 'safe action' }),
    budgetStatus: vi.fn().mockResolvedValue({ totalSpendUsd: 1.25, byModel: [{ model: 'claude', costUsd: 1.25 }] }),
  };

  const server = createGovernorServer({ governor });
  const result = await tool(server, 'fbeast_governor_check', { action: 'edit_file', context: '{}' });
  expect(text(result)).toContain('approved');
});
```

- [ ] **Step 2: Run tests to verify red**

Run: `cd packages/franken-mcp-suite && npm test -- --run src/servers/memory.test.ts src/servers/observer.test.ts src/servers/governor.test.ts`

Expected: FAIL because the server constructors still expect `SqliteStore` directly and no adapter files exist.

- [ ] **Step 3: Implement the thin adapters over existing engines**

```ts
// packages/franken-mcp-suite/src/adapters/brain-adapter.ts
import { SqliteBrain } from 'franken-brain';

export function createBrainAdapter(dbPath: string) {
  const brain = new SqliteBrain({ dbPath });
  return {
    query(input: { query: string; type?: string; limit?: number }) {
      return brain.search(input.query, { type: input.type, limit: input.limit ?? 20 });
    },
    store(input: { key: string; value: string; type: string }) {
      return brain.remember(input.key, input.value, input.type);
    },
    frontload(projectId: string) {
      return brain.frontload(projectId);
    },
    forget(key: string) {
      return brain.forget(key);
    },
  };
}
```

```ts
// packages/franken-mcp-suite/src/adapters/governor-adapter.ts
export function createGovernorAdapter(deps: {
  check(input: { action: string; context: string }): Promise<{ decision: string; reason: string }>;
  budgetStatus(): Promise<{ totalSpendUsd: number; byModel: Array<{ model: string; costUsd: number }> }>;
}) {
  return deps;
}
```

- [ ] **Step 4: Refactor the three servers to depend on adapter objects**

```ts
// packages/franken-mcp-suite/src/servers/memory.ts
export interface MemoryServerDeps {
  brain: ReturnType<typeof createBrainAdapter>;
}

export function createMemoryServer(deps: MemoryServerDeps): FbeastMcpServer {
  const { brain } = deps;
  // handlers call brain.query / brain.store / brain.frontload / brain.forget
}
```

```ts
// packages/franken-mcp-suite/src/servers/governor.ts
export interface GovernorServerDeps {
  governor: {
    check(input: { action: string; context: string }): Promise<{ decision: string; reason: string }>;
    budgetStatus(): Promise<{ totalSpendUsd: number; byModel: Array<{ model: string; costUsd: number }> }>;
  };
}
```

- [ ] **Step 5: Verify the chunk**

Run: `cd packages/franken-mcp-suite && npm test -- --run src/servers/memory.test.ts src/servers/observer.test.ts src/servers/governor.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/franken-mcp-suite/src/adapters/brain-adapter.ts \
  packages/franken-mcp-suite/src/adapters/observer-adapter.ts \
  packages/franken-mcp-suite/src/adapters/governor-adapter.ts \
  packages/franken-mcp-suite/src/servers/memory.ts \
  packages/franken-mcp-suite/src/servers/observer.ts \
  packages/franken-mcp-suite/src/servers/governor.ts \
  packages/franken-mcp-suite/src/index.ts \
  packages/franken-mcp-suite/src/servers/memory.test.ts \
  packages/franken-mcp-suite/src/servers/observer.test.ts \
  packages/franken-mcp-suite/src/servers/governor.test.ts
git commit -m "feat(mcp-suite): wire memory observer governor adapters"
```

---

### Task 3: Planner And Critique Adapter Chunk

**Files:**
- Create: `packages/franken-mcp-suite/src/adapters/planner-adapter.ts`
- Create: `packages/franken-mcp-suite/src/adapters/critique-adapter.ts`
- Modify: `packages/franken-mcp-suite/src/servers/planner.ts`
- Modify: `packages/franken-mcp-suite/src/servers/critique.ts`
- Modify: `packages/franken-mcp-suite/src/index.ts`
- Test: `packages/franken-mcp-suite/src/servers/planner.test.ts`
- Test: `packages/franken-mcp-suite/src/servers/critique.test.ts`

- [ ] **Step 1: Write failing tests around real planner and critique delegation**

```ts
// packages/franken-mcp-suite/src/servers/planner.test.ts
it('delegates decompose and validate to the planner adapter', async () => {
  const planner = {
    decompose: vi.fn().mockResolvedValue({ planId: 'p1', objective: 'ship', tasks: [{ id: 't1', title: 'wire adapter', deps: [] }] }),
    visualize: vi.fn().mockResolvedValue('graph TD\n  t1["wire adapter"]'),
    validate: vi.fn().mockResolvedValue({ verdict: 'valid', issues: [] }),
  };

  const server = createPlannerServer({ planner });
  await tool(server, 'fbeast_plan_decompose', { objective: 'ship' });
  expect(planner.decompose).toHaveBeenCalledWith({ objective: 'ship', constraints: undefined });
});
```

```ts
// packages/franken-mcp-suite/src/servers/critique.test.ts
it('delegates evaluate to the critique adapter with evaluator selection', async () => {
  const critique = {
    evaluate: vi.fn().mockResolvedValue({ verdict: 'warn', score: 0.72, findings: [{ severity: 'warning', message: 'deep nesting' }] }),
    compare: vi.fn(),
  };

  const server = createCritiqueServer({ critique });
  await tool(server, 'fbeast_critique_evaluate', { content: 'x', criteria: 'correctness', evaluators: 'logic-loop' });
  expect(critique.evaluate).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to verify red**

Run: `cd packages/franken-mcp-suite && npm test -- --run src/servers/planner.test.ts src/servers/critique.test.ts`

Expected: FAIL because the planner and critique servers still implement local logic directly and do not accept adapter deps.

- [ ] **Step 3: Implement planner and critique adapters**

```ts
// packages/franken-mcp-suite/src/adapters/planner-adapter.ts
import { GraphBuilder } from 'franken-planner';

export function createPlannerAdapter() {
  const planner = new GraphBuilder();
  return {
    async decompose(input: { objective: string; constraints?: string }) {
      const graph = await planner.build({ goal: input.objective, constraints: input.constraints });
      return {
        planId: graph.id,
        objective: input.objective,
        tasks: graph.tasks,
      };
    },
    async visualize(planId: string) {
      return planner.toMermaid(planId);
    },
    async validate(planId: string) {
      return planner.validate(planId);
    },
  };
}
```

```ts
// packages/franken-mcp-suite/src/adapters/critique-adapter.ts
import { review } from '@franken/critique';

export function createCritiqueAdapter() {
  return {
    evaluate(input: { content: string; criteria: string[]; evaluators?: string[] }) {
      return review(input.content, { criteria: input.criteria, evaluators: input.evaluators });
    },
    compare(input: { original: string; revised: string }) {
      return review.compare(input.original, input.revised);
    },
  };
}
```

- [ ] **Step 4: Replace local template/heuristic logic in the two servers**

```ts
// packages/franken-mcp-suite/src/servers/planner.ts
export interface PlannerServerDeps {
  planner: ReturnType<typeof createPlannerAdapter>;
}

// packages/franken-mcp-suite/src/servers/critique.ts
export interface CritiqueServerDeps {
  critique: ReturnType<typeof createCritiqueAdapter>;
}
```

- [ ] **Step 5: Verify the chunk**

Run: `cd packages/franken-mcp-suite && npm test -- --run src/servers/planner.test.ts src/servers/critique.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/franken-mcp-suite/src/adapters/planner-adapter.ts \
  packages/franken-mcp-suite/src/adapters/critique-adapter.ts \
  packages/franken-mcp-suite/src/servers/planner.ts \
  packages/franken-mcp-suite/src/servers/critique.ts \
  packages/franken-mcp-suite/src/index.ts \
  packages/franken-mcp-suite/src/servers/planner.test.ts \
  packages/franken-mcp-suite/src/servers/critique.test.ts
git commit -m "feat(mcp-suite): wire planner and critique adapters"
```

---

### Task 4: Firewall, Skills, And Real Hook Runtime Chunk

**Files:**
- Create: `packages/franken-mcp-suite/src/adapters/firewall-adapter.ts`
- Create: `packages/franken-mcp-suite/src/adapters/skills-adapter.ts`
- Modify: `packages/franken-mcp-suite/src/servers/firewall.ts`
- Modify: `packages/franken-mcp-suite/src/servers/skills.ts`
- Modify: `packages/franken-mcp-suite/src/cli/hook.ts`
- Modify: `packages/franken-mcp-suite/src/cli/init.ts`
- Create: `packages/franken-mcp-suite/src/integration/hook.integration.test.ts`
- Test: `packages/franken-mcp-suite/src/servers/firewall.test.ts`
- Test: `packages/franken-mcp-suite/src/servers/skills.test.ts`
- Test: `packages/franken-mcp-suite/src/integration/hook.integration.test.ts`

- [ ] **Step 1: Write failing tests for orchestrator-backed firewall/skills and real hook behavior**

```ts
// packages/franken-mcp-suite/src/integration/hook.integration.test.ts
it('pre-tool hook blocks denied actions', async () => {
  const result = await runHookForTest(['pre-tool', 'rm -rf /tmp/nope'], {
    governorDecision: { decision: 'denied', reason: 'destructive' },
  });

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain('destructive');
});

it('post-tool hook records observer events', async () => {
  const result = await runHookForTest(['post-tool', 'write_file', '{"ok":true}']);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('"logged":true');
});
```

- [ ] **Step 2: Run tests to verify red**

Run: `cd packages/franken-mcp-suite && npm test -- --run src/servers/firewall.test.ts src/servers/skills.test.ts src/integration/hook.integration.test.ts`

Expected: FAIL because the servers still use local logic and `src/cli/hook.ts` only emits a placeholder payload.

- [ ] **Step 3: Implement the adapter layer for firewall and skills**

```ts
// packages/franken-mcp-suite/src/adapters/firewall-adapter.ts
export function createFirewallAdapter(deps: {
  scanText(input: string): Promise<{ verdict: 'clean' | 'flagged'; matchedPatterns: string[] }>;
  scanFile(path: string): Promise<{ verdict: 'clean' | 'flagged'; matchedPatterns: string[] }>;
}) {
  return deps;
}
```

```ts
// packages/franken-mcp-suite/src/adapters/skills-adapter.ts
export function createSkillsAdapter(deps: {
  list(input: { enabled?: boolean }): Promise<Array<{ name: string; enabled: boolean; description: string; updatedAt?: string }>>;
  info(skillId: string): Promise<Record<string, unknown> | undefined>;
}) {
  return deps;
}
```

- [ ] **Step 4: Turn `fbeast-hook` into a real pre/post runtime**

```ts
// packages/franken-mcp-suite/src/cli/hook.ts
export async function runHook(argv: string[] = process.argv.slice(2), deps = defaultHookDeps()) {
  const [phase, toolName, payload = ''] = argv;

  if (phase === 'pre-tool') {
    const decision = await deps.governor.check({ action: toolName, context: payload });
    if (decision.decision === 'denied') {
      process.stderr.write(`${decision.reason}\n`);
      process.exitCode = 1;
      return;
    }
    process.stdout.write(JSON.stringify({ allowed: true, decision: decision.decision }) + '\n');
    return;
  }

  if (phase === 'post-tool') {
    await deps.observer.log({
      event: 'tool_call',
      metadata: JSON.stringify({ toolName, payload }),
      sessionId: deps.sessionId(),
    });
    process.stdout.write(JSON.stringify({ logged: true }) + '\n');
    return;
  }

  throw new Error('Usage: fbeast-hook <pre-tool|post-tool> ...');
}
```

- [ ] **Step 5: Verify the chunk**

Run: `cd packages/franken-mcp-suite && npm test -- --run src/servers/firewall.test.ts src/servers/skills.test.ts src/integration/hook.integration.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/franken-mcp-suite/src/adapters/firewall-adapter.ts \
  packages/franken-mcp-suite/src/adapters/skills-adapter.ts \
  packages/franken-mcp-suite/src/servers/firewall.ts \
  packages/franken-mcp-suite/src/servers/skills.ts \
  packages/franken-mcp-suite/src/cli/hook.ts \
  packages/franken-mcp-suite/src/cli/init.ts \
  packages/franken-mcp-suite/src/integration/hook.integration.test.ts \
  packages/franken-mcp-suite/src/servers/firewall.test.ts \
  packages/franken-mcp-suite/src/servers/skills.test.ts
git commit -m "feat(mcp-suite): wire firewall skills and hook runtime"
```

---

### Task 5: MCP Docs And Launch-Proof Chunk

**Files:**
- Modify: `README.md`
- Modify: `packages/franken-web/README.md`
- Modify: `packages/franken-mcp-suite/src/integration/server-startup.integration.test.ts`
- Test: `packages/franken-mcp-suite/src/integration/server-startup.integration.test.ts`

- [ ] **Step 1: Write failing docs-alignment and final MCP smoke assertions**

```ts
// packages/franken-mcp-suite/src/integration/server-startup.integration.test.ts
it('prints a complete tool surface for the combined server', () => {
  const result = spawnSync('node', [join(DIST, 'beast.js'), '--db', '.fbeast/test.db'], {
    input: '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}\n',
    encoding: 'utf8',
    timeout: 2000,
  });

  expect(result.stdout).toContain('fbeast_memory_query');
  expect(result.stdout).toContain('fbeast_skills_list');
});
```

- [ ] **Step 2: Run tests to verify red**

Run: `cd packages/franken-mcp-suite && npm test -- --run src/integration/server-startup.integration.test.ts`

Expected: FAIL until the combined startup smoke assertions and docs changes are in place.

- [ ] **Step 3: Add the final MCP proof tests and update docs**

```md
<!-- README.md -->
## Modes

- `MCP mode`: Claude Code plugin/tool-provider surface via `@fbeast/mcp-suite`
- `Beast mode`: standalone orchestrator path with dashboard-first control and CLI parity

Both modes share `.fbeast/beast.db`.
```

```md
<!-- packages/franken-web/README.md -->
## Launch Role

The dashboard is the primary Beast operator UI. CLI users can perform the same core operations through `frankenbeast beasts`.
```

- [ ] **Step 4: Verify the chunk**

Run: `cd packages/franken-mcp-suite && npm test -- --run src/integration/server-startup.integration.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add README.md \
  packages/franken-web/README.md \
  packages/franken-mcp-suite/src/integration/server-startup.integration.test.ts
git commit -m "docs: align mcp launch story with shipped behavior"
```

---

### Task 6: Beast CLI Parity Chunk

**Files:**
- Modify: `packages/franken-orchestrator/src/cli/args.ts`
- Modify: `packages/franken-orchestrator/src/cli/beast-cli.ts`
- Modify: `packages/franken-orchestrator/src/cli/run.ts`
- Create: `packages/franken-orchestrator/src/cli/beast-control-client.ts`
- Create: `packages/franken-orchestrator/tests/unit/cli/beast-cli.test.ts`
- Modify: `packages/franken-orchestrator/tests/unit/cli/args.test.ts`
- Modify: `packages/franken-orchestrator/tests/integration/beasts/agent-routes.test.ts`

- [ ] **Step 1: Write failing tests for the missing parity actions**

```ts
// packages/franken-orchestrator/tests/unit/cli/beast-cli.test.ts
it('resumes an agent by id', async () => {
  const control = { resumeAgent: vi.fn().mockResolvedValue({ id: 'run-2' }) };
  await handleBeastCommand({
    args: { subcommand: 'beasts', beastAction: 'resume', beastTarget: 'agent-1' } as CliArgs,
    io: fakeIo(),
    paths: fakePaths(),
    print: vi.fn(),
    control,
  });
  expect(control.resumeAgent).toHaveBeenCalledWith('agent-1', expect.any(String));
});

it('deletes a stopped agent by id', async () => {
  const control = { deleteAgent: vi.fn().mockResolvedValue(undefined) };
  await handleBeastCommand({
    args: { subcommand: 'beasts', beastAction: 'delete', beastTarget: 'agent-1' } as CliArgs,
    io: fakeIo(),
    paths: fakePaths(),
    print: vi.fn(),
    control,
  });
  expect(control.deleteAgent).toHaveBeenCalledWith('agent-1');
});
```

- [ ] **Step 2: Run tests to verify red**

Run: `cd packages/franken-orchestrator && npm test -- tests/unit/cli/args.test.ts tests/unit/cli/beast-cli.test.ts tests/integration/beasts/agent-routes.test.ts`

Expected: FAIL because `resume` and `delete` are not valid Beast actions and no shared control client exists.

- [ ] **Step 3: Add the Beast control client and wire the missing actions**

```ts
// packages/franken-orchestrator/src/cli/beast-control-client.ts
import { createBeastServices } from '../beasts/create-beast-services.js';

export function createBeastControlClient(paths: ProjectPaths) {
  const services = createBeastServices(paths);
  return {
    listRuns: () => services.runs.listRuns(),
    getRun: (runId: string) => services.runs.getRun(runId),
    readLogs: (runId: string) => services.runs.readLogs(runId),
    stopRun: (runId: string, actor: string) => services.runs.stop(runId, actor),
    restartRun: (runId: string, actor: string) => services.runs.restart(runId, actor),
    resumeAgent: async (agentId: string, actor: string) => {
      const agent = services.agents.getAgent(agentId);
      if (!agent.dispatchRunId) {
        throw new Error(`Tracked agent '${agentId}' has no linked run to resume`);
      }
      services.agents.appendEvent(agentId, {
        level: 'info',
        type: 'agent.resume.requested',
        message: `Resume requested for linked run ${agent.dispatchRunId}`,
        payload: { runId: agent.dispatchRunId },
      });
      return services.runs.start(agent.dispatchRunId, actor);
    },
    deleteAgent: async (agentId: string) => {
      services.agents.appendEvent(agentId, {
        level: 'info',
        type: 'agent.delete.requested',
        message: 'Soft-deleted tracked agent from the CLI',
        payload: {},
      });
      return services.agents.softDeleteAgent(agentId);
    },
    createRun: (input: Parameters<typeof services.dispatch.createRun>[0]) => services.dispatch.createRun(input),
  };
}
```

```ts
// packages/franken-orchestrator/src/cli/args.ts
export type BeastAction =
  | 'catalog'
  | 'spawn'
  | 'list'
  | 'status'
  | 'logs'
  | 'stop'
  | 'kill'
  | 'restart'
  | 'resume'
  | 'delete'
  | undefined;
```

- [ ] **Step 4: Update the command handler and usage text**

```ts
// packages/franken-orchestrator/src/cli/beast-cli.ts
case 'resume': {
  if (!args.beastTarget) throw new Error('beasts resume requires an agent id');
  const run = await control.resumeAgent(args.beastTarget, actor);
  print(`Resumed ${run.id}`);
  return;
}
case 'delete': {
  if (!args.beastTarget) throw new Error('beasts delete requires an agent id');
  await control.deleteAgent(args.beastTarget);
  print(`Deleted ${args.beastTarget}`);
  return;
}
```

- [ ] **Step 5: Verify the chunk**

Run: `cd packages/franken-orchestrator && npm test -- tests/unit/cli/args.test.ts tests/unit/cli/beast-cli.test.ts tests/integration/beasts/agent-routes.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/franken-orchestrator/src/cli/args.ts \
  packages/franken-orchestrator/src/cli/beast-cli.ts \
  packages/franken-orchestrator/src/cli/run.ts \
  packages/franken-orchestrator/src/cli/beast-control-client.ts \
  packages/franken-orchestrator/tests/unit/cli/beast-cli.test.ts \
  packages/franken-orchestrator/tests/unit/cli/args.test.ts \
  packages/franken-orchestrator/tests/integration/beasts/agent-routes.test.ts
git commit -m "feat(orchestrator): add beast cli parity actions"
```

---

### Task 7: Beast Activation And Risk-Acknowledgment Chunk

**Files:**
- Create: `packages/franken-mcp-suite/src/cli/beast-mode.ts`
- Create: `packages/franken-mcp-suite/src/cli/beast-mode.test.ts`
- Modify: `packages/franken-mcp-suite/src/cli/main.ts`
- Modify: `packages/franken-mcp-suite/src/shared/config.ts`
- Modify: `packages/franken-mcp-suite/src/index.ts`
- Test: `packages/franken-mcp-suite/src/cli/beast-mode.test.ts`
- Test: `packages/franken-mcp-suite/src/shared/config.test.ts`

- [ ] **Step 1: Write failing tests for provider selection and CLI-risk acknowledgment**

```ts
// packages/franken-mcp-suite/src/cli/beast-mode.test.ts
it('persists beast mode provider for compliant providers without prompting', async () => {
  const root = makeTmpProject();
  await runBeastMode(['--provider=anthropic-api'], { root, confirm: vi.fn() });
  const cfg = FbeastConfig.load(root);
  expect(cfg.mode).toBe('beast');
  expect(cfg.beast.provider).toBe('anthropic-api');
  expect(cfg.beast.acknowledged_cli_risk).toBe(false);
});

it('requires confirmation before enabling claude-cli provider', async () => {
  const root = makeTmpProject();
  await expect(runBeastMode(['--provider=claude-cli'], { root, confirm: async () => false })).rejects.toThrow('aborted');
});
```

- [ ] **Step 2: Run tests to verify red**

Run: `cd packages/franken-mcp-suite && npm test -- --run src/cli/beast-mode.test.ts src/shared/config.test.ts`

Expected: FAIL because `src/cli/beast-mode.ts` does not exist and `main.ts` does not route `beast`.

- [ ] **Step 3: Implement Beast activation as config persistence plus orchestrator handoff**

```ts
// packages/franken-mcp-suite/src/cli/beast-mode.ts
export async function runBeastMode(
  argv: string[],
  deps: {
    root: string;
    confirm(message: string): Promise<boolean>;
    exec(command: string, args: string[]): Promise<void>;
  },
): Promise<void> {
  const provider = argv.find((arg) => arg.startsWith('--provider='))?.split('=')[1] ?? 'anthropic-api';
  const config = existsSync(join(deps.root, '.fbeast', 'config.json'))
    ? FbeastConfig.load(deps.root)
    : FbeastConfig.init(deps.root);

  if (provider === 'claude-cli' && !config.beast.acknowledged_cli_risk) {
    const accepted = await deps.confirm('Continue with claude-cli provider? [y/N]');
    if (!accepted) throw new Error('Beast mode activation aborted');
    config.beast.acknowledged_cli_risk = true;
  }

  config.mode = 'beast';
  config.beast.enabled = true;
  config.beast.provider = provider;
  config.save();

  await deps.exec('frankenbeast', ['beasts', 'catalog']);
}

export function createDefaultBeastModeDeps(root: string) {
  return {
    root,
    confirm: confirmYesNo,
    exec: (command: string, args: string[]) => spawnAndWait(command, args, { cwd: root }),
  };
}
```

- [ ] **Step 4: Route the new command and export it**

```ts
// packages/franken-mcp-suite/src/cli/main.ts
case 'beast': {
  const { runBeastMode } = await import('./beast-mode.js');
  await runBeastMode(process.argv.slice(3), createDefaultBeastModeDeps(process.cwd()));
  break;
}
```

- [ ] **Step 5: Verify the chunk**

Run: `cd packages/franken-mcp-suite && npm test -- --run src/cli/beast-mode.test.ts src/shared/config.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/franken-mcp-suite/src/cli/beast-mode.ts \
  packages/franken-mcp-suite/src/cli/beast-mode.test.ts \
  packages/franken-mcp-suite/src/cli/main.ts \
  packages/franken-mcp-suite/src/shared/config.ts \
  packages/franken-mcp-suite/src/index.ts \
  packages/franken-mcp-suite/src/shared/config.test.ts
git commit -m "feat(mcp-suite): add beast activation and cli risk gate"
```

---

### Task 8: Dual-Mode Release Gate Chunk

**Files:**
- Modify: `packages/franken-mcp-suite/src/integration/dual-mode.integration.test.ts`
- Modify: `packages/franken-mcp-suite/src/integration/hook.integration.test.ts`
- Modify: `packages/franken-mcp-suite/src/integration/server-startup.integration.test.ts`
- Modify: `README.md`
- Modify: `packages/franken-web/README.md`
- Modify: `tasks/todo.md`

- [ ] **Step 1: Add the final release-gate integration tests**

```ts
// packages/franken-mcp-suite/src/integration/dual-mode.integration.test.ts
it('keeps Claude config stable while switching from MCP mode to Beast mode', async () => {
  const root = makeTmpProject();
  const claudeDir = join(root, '.claude');

  runInit({ root, claudeDir, hooks: true, servers: ['memory', 'planner'] });
  const before = readFileSync(join(claudeDir, 'settings.json'), 'utf8');

  await runBeastMode(['--provider=anthropic-api'], fakeDeps(root));
  const after = readFileSync(join(claudeDir, 'settings.json'), 'utf8');

  expect(JSON.parse(after).mcpServers).toEqual(JSON.parse(before).mcpServers);
  expect(FbeastConfig.load(root).mode).toBe('beast');
});
```

- [ ] **Step 2: Run the end-to-end release gate to verify red**

Run: `cd packages/franken-mcp-suite && npm test -- --run src/integration/init-uninstall.integration.test.ts src/integration/server-startup.integration.test.ts src/integration/hook.integration.test.ts src/integration/dual-mode.integration.test.ts`

Expected: FAIL until all prior chunks are merged.

- [ ] **Step 3: Run full package and workspace verification once all chunks land**

Run: `cd packages/franken-mcp-suite && npm test && npm run build && npm run typecheck`

Expected: PASS.

Run: `cd packages/franken-orchestrator && npm test -- tests/unit/cli/args.test.ts tests/unit/cli/beast-cli.test.ts tests/integration/beasts/agent-routes.test.ts && npm run typecheck`

Expected: PASS.

Run: `cd /home/pfk/dev/frankenbeast && npm run typecheck`

Expected: PASS.

- [ ] **Step 4: Refresh launch docs and tracking**

```md
<!-- tasks/todo.md -->
# fbeast dual-mode launch

- [ ] Chunk 1: MCP contract and smoke harness
- [ ] Chunk 2: memory/observer/governor adapters
- [ ] Chunk 3: planner/critique adapters
- [ ] Chunk 4: firewall/skills and real hook runtime
- [ ] Chunk 5: MCP docs and launch proof
- [ ] Chunk 6: Beast CLI parity
- [ ] Chunk 7: Beast activation and risk gate
- [ ] Chunk 8: dual-mode release gate
```

- [ ] **Step 5: Commit**

```bash
git add packages/franken-mcp-suite/src/integration/dual-mode.integration.test.ts \
  packages/franken-mcp-suite/src/integration/hook.integration.test.ts \
  packages/franken-mcp-suite/src/integration/server-startup.integration.test.ts \
  README.md \
  packages/franken-web/README.md \
  tasks/todo.md
git commit -m "test: add dual-mode release gate coverage"
```

---

## Recommended Execution Order

1. Task 1: MCP contract and smoke harness
2. Task 2: memory/observer/governor adapters
3. Task 3: planner/critique adapters
4. Task 4: firewall/skills/hook runtime
5. Task 5: MCP docs and launch proof
6. Task 6: Beast CLI parity
7. Task 7: Beast activation and risk gate
8. Task 8: dual-mode release gate

## Self-Review

- **Spec coverage:** MCP real adapters, working hooks, Beast activation, CLI parity, shared-state verification, and docs/release gate are all mapped to dedicated tasks above.
- **Placeholder scan:** No `TBD`, `TODO`, or “similar to task N” references remain.
- **Type consistency:** The chunk sequence keeps adapter types inside `packages/franken-mcp-suite` and Beast control types inside `packages/franken-orchestrator`; Beast activation in MCP mode only persists config and hands off rather than duplicating Beast execution logic.
