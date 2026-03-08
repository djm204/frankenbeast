# ExecuteTask Workflow Design

## Problem

The Beast Loop Phase 3 (`executeTask()` in `franken-orchestrator/src/phases/execution.ts`) is a stub. It hardcodes success without invoking any skill. The CLI cannot run without `--dry-run`. This design makes skill execution real — end-to-end from planned task to actual output.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Skill execution model | Hybrid (LLM + function + MCP) | Skills declare their execution type. LLM skills use ILlmClient, function skills run JS handlers, MCP skills delegate to McpRegistry. |
| LLM access for skills | ILlmClient injection | Skills that need LLM access receive an ILlmClient (from @franken/types). Firewall ran in Phase 1; Phase 3 is Skills + Governor + MCP only. |
| Skill input construction | Task context bundle | SkillInput bundles task objective + memory context (ADRs, errors, rules) + outputs from completed dependency tasks. |
| Execution ownership | ISkillsModule.execute() | Skills module owns dispatch logic. Orchestrator stays thin — calls `skills.execute(skillId, input)` and records results. |
| MCP integration | IMcpModule as optional dep | Not all deployments use MCP servers. When present, MCP tools surface as skills with executionType='mcp'. |

## Architecture Alignment

```
Phase 3: Execution
├── Skills (MOD-02) — skill lookup + hybrid dispatch (LLM/function/MCP)
├── Governor (MOD-07) — HITL approval gating
└── MCP Registry — external tool execution via stdio MCP servers
```

Per the Beast Loop architecture, the firewall is Phase 1 only. Phase 3 participants are Skills, Governor, and MCP Registry.

## Data Flow

```
ctx.plan.tasks (from Phase 2, topological order)
    │
    ▼
┌─────────────────────────────────────────────────┐
│  executeTask(task)                               │
│                                                 │
│  1. Build SkillInput:                           │
│     ├── task.objective                          │
│     ├── ctx.sanitizedIntent.context (ADRs...)   │
│     └── dependencyOutputs (Map<taskId, output>) │
│                                                 │
│  2. HITL gate (existing):                       │
│     └── governor.requestApproval()              │
│         → approved | rejected | abort           │
│                                                 │
│  3. Execute each requiredSkill:                 │
│     └── skills.execute(skillId, input)          │
│         ├── executionType='llm'                 │
│         │   └── ILlmClient.complete(prompt)     │
│         ├── executionType='function'            │
│         │   └── handler(input) → output         │
│         └── executionType='mcp'                 │
│             └── mcp.callTool(name, args)        │
│                                                 │
│  4. Record trace (real input/output):           │
│     └── memory.recordTrace({ taskId, outcome }) │
│                                                 │
│  5. Emit span with outcome metadata:            │
│     └── span.end({ status, output })            │
└─────────────────────────────────────────────────┘
    │
    ▼
TaskOutcome { taskId, status, output?, error? }
```

## Interface Changes

### 1. Extend ISkillsModule (deps.ts)

```typescript
export interface ISkillsModule {
  hasSkill(skillId: string): boolean;
  getAvailableSkills(): readonly SkillDescriptor[];
  execute(skillId: string, input: SkillInput): Promise<SkillResult>;
}
```

### 2. New types (deps.ts)

```typescript
export interface SkillInput {
  readonly objective: string;
  readonly context: MemoryContext;
  readonly dependencyOutputs: ReadonlyMap<string, unknown>;
  readonly sessionId: string;
  readonly projectId: string;
}

export interface SkillResult {
  readonly output: unknown;
  readonly tokensUsed?: number;
}
```

### 3. Extend SkillDescriptor

```typescript
export interface SkillDescriptor {
  readonly id: string;
  readonly name: string;
  readonly requiresHitl: boolean;
  readonly executionType: 'llm' | 'function' | 'mcp';
}
```

### 4. New IMcpModule (deps.ts)

```typescript
export interface IMcpModule {
  callTool(name: string, args: Record<string, unknown>): Promise<McpToolCallResult>;
  getAvailableTools(): readonly McpToolInfo[];
}

export interface McpToolCallResult {
  readonly content: unknown;
  readonly isError: boolean;
}

export interface McpToolInfo {
  readonly name: string;
  readonly serverId: string;
  readonly description: string;
}
```

### 5. Wire into BeastLoopDeps

```typescript
export interface BeastLoopDeps {
  readonly firewall: IFirewallModule;
  readonly skills: ISkillsModule;
  readonly memory: IMemoryModule;
  readonly planner: IPlannerModule;
  readonly observer: IObserverModule;
  readonly critique: ICritiqueModule;
  readonly governor: IGovernorModule;
  readonly heartbeat: IHeartbeatModule;
  readonly mcp?: IMcpModule;        // Optional — not all deployments use MCP
  readonly clock: () => Date;
}
```

### 6. Update runExecution signature

```typescript
export async function runExecution(
  ctx: BeastContext,
  skills: ISkillsModule,
  governor: IGovernorModule,
  memory: IMemoryModule,
  observer: IObserverModule,
  mcp?: IMcpModule,
): Promise<readonly TaskOutcome[]>
```

## executeTask Implementation

Replace lines 116-128 of execution.ts:

```typescript
async function executeTask(
  task: PlanTask,
  skills: ISkillsModule,
  governor: IGovernorModule,
  memory: IMemoryModule,
  observer: IObserverModule,
  ctx: BeastContext,
  completedOutputs: ReadonlyMap<string, unknown>,
  mcp?: IMcpModule,
): Promise<TaskOutcome> {
  const span = observer.startSpan(`task:${task.id}`);

  try {
    // 1. HITL gate (existing logic, unchanged)
    const requiresHitl = task.requiredSkills.some(s => {
      const available = skills.getAvailableSkills();
      const skill = available.find(sk => sk.id === s);
      return skill?.requiresHitl ?? false;
    });

    if (requiresHitl) {
      const approval = await governor.requestApproval({
        taskId: task.id,
        summary: task.objective,
        requiresHitl: true,
      });
      if (approval.decision === 'rejected' || approval.decision === 'abort') {
        ctx.addAudit('governor', 'task:rejected', { taskId: task.id });
        return { taskId: task.id, status: 'skipped', error: approval.reason ?? 'Rejected' };
      }
    }

    // 2. Build skill input
    const input: SkillInput = {
      objective: task.objective,
      context: ctx.sanitizedIntent?.context ?? { adrs: [], knownErrors: [], rules: [] },
      dependencyOutputs: completedOutputs,
      sessionId: ctx.sessionId,
      projectId: ctx.projectId,
    };

    ctx.addAudit('executor', 'task:start', { taskId: task.id, objective: task.objective });

    // 3. Execute skills
    let lastOutput: unknown = undefined;
    let totalTokens = 0;

    for (const skillId of task.requiredSkills) {
      if (!skills.hasSkill(skillId)) {
        throw new Error(`Skill not found: ${skillId}`);
      }
      const result = await skills.execute(skillId, input);
      lastOutput = result.output;
      totalTokens += result.tokensUsed ?? 0;
    }

    // If no required skills, task is a no-op (passthrough)
    if (task.requiredSkills.length === 0) {
      lastOutput = { passthrough: true, objective: task.objective };
    }

    // 4. Record trace with real output
    await memory.recordTrace({
      taskId: task.id,
      summary: task.objective,
      outcome: 'success',
      timestamp: new Date().toISOString(),
    });

    ctx.addAudit('executor', 'task:complete', { taskId: task.id, tokensUsed: totalTokens });
    return { taskId: task.id, status: 'success', output: lastOutput };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    await memory.recordTrace({
      taskId: task.id,
      summary: task.objective,
      outcome: 'failure',
      timestamp: new Date().toISOString(),
    });

    ctx.addAudit('executor', 'task:failed', { taskId: task.id, error: errorMsg });
    return { taskId: task.id, status: 'failure', error: errorMsg };

  } finally {
    span.end({ taskId: task.id });
  }
}
```

## Dependency Outputs Threading

The `runExecution` loop must track outputs from completed tasks and pass them to subsequent tasks:

```typescript
const completedOutputs = new Map<string, unknown>();

// ... in the execution loop:
const outcome = await executeTask(task, skills, governor, memory, observer, ctx, completedOutputs, mcp);

if (outcome.status === 'success') {
  completed.add(task.id);
  completedOutputs.set(task.id, outcome.output);
}
```

## Error Handling

| Error | Behavior |
|-------|----------|
| Skill not found | Task fails, recorded as failure trace |
| Skill execution error | Task fails, recorded as failure trace |
| Governor rejects | Task skipped (existing behavior) |
| MCP tool error (isError=true) | Skill returns error, task fails |
| ILlmClient error | Skill returns error, task fails |

Failed tasks do NOT block dependent tasks from attempting — they are added to `completed` only on success, so dependents get skipped via the "unmet dependencies" path.

## Test Impact

### Unit tests (execution.test.ts)

Existing tests continue to work because:
- `makeSkills()` stub returns `hasSkill: true` and empty `getAvailableSkills()`
- Tasks with `requiredSkills: []` bypass skill execution (passthrough)
- Need to add `execute` mock to `makeSkills()`

New tests needed:
- Task with required skills calls `skills.execute()`
- Skill not found → task failure
- Skill execution error → task failure
- Dependency outputs passed to subsequent tasks
- Multiple required skills execute sequentially
- MCP module integration (when present)

### E2E tests

- `InMemorySkills` needs `execute()` method
- Happy path tests should verify real output flows through
- Existing test assertions still hold (status checks, trace counts)

### Test helpers

- `makeSkills()` in stubs.ts needs `execute` mock
- `InMemorySkills` in in-memory-ports.ts needs `execute()` implementation

## Scope

### In scope
- Wire `ISkillsModule.execute()` into `executeTask()`
- Add `SkillInput`, `SkillResult`, `IMcpModule` types to deps.ts
- Add `executionType` to `SkillDescriptor`
- Thread dependency outputs through execution loop
- Update test helpers (stubs + in-memory ports)
- Record failure traces (not just success)
- Add `IMcpModule` as optional dep in `BeastLoopDeps`

### Out of scope (future work)
- Concrete skill implementations (LLM prompt templates, function handlers)
- MCP Registry ↔ Skill Registry auto-registration
- Parallel task execution (currently sequential within each topo level)
- Token budget enforcement during execution
- Retry/recovery for failed skills
