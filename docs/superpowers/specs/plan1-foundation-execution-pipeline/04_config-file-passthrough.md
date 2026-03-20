# Chunk 04: Config File Passthrough to Spawned Processes

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pass the full wizard config to spawned agent processes via a JSON file, create `RunConfigLoader` to parse it in the spawned process, and wire it into `dep-factory.ts` so modules, LLM overrides, git settings, skills, and prompts are actually used.

**Spec section:** Plan 1, Section 4

**ADR:** `docs/adr/029-config-file-passthrough-spawned-agents.md`

**Depends on:** Chunk 02 (executor wiring), Chunk 03 (real buildProcessSpec)

---

## Files

- **Modify:** `packages/franken-orchestrator/src/beasts/execution/process-beast-executor.ts` (write config file before spawn)
- **Create:** `packages/franken-orchestrator/src/cli/run-config-loader.ts` (RunConfigSchema + RunConfigLoader)
- **Modify:** `packages/franken-orchestrator/src/cli/dep-factory.ts` (consume RunConfig)
- **Create:** `packages/franken-orchestrator/tests/unit/cli/run-config-loader.test.ts`
- **Create:** `packages/franken-orchestrator/tests/unit/beasts/execution/config-passthrough.test.ts`

---

## Pre-conditions (from earlier chunks)

After Chunk 02, `ProcessBeastExecutor` constructor is: `(repository, logs, supervisor, onRunStatusChange?)`.
After Chunk 01, `ProcessSupervisorLike.spawn()` accepts `(spec, callbacks)`.

---

## Context

Read these files before starting:

- `packages/franken-orchestrator/src/beasts/execution/process-beast-executor.ts` — modified in Chunk 02
- `packages/franken-orchestrator/src/cli/config-loader.ts` — existing config loading (CLI > env > file > defaults). **Do not modify this file.** RunConfigLoader is separate.
- `packages/franken-orchestrator/src/config/orchestrator-config.ts` — `OrchestratorConfigSchema` (incompatible shape — different concern)
- `packages/franken-orchestrator/src/cli/dep-factory.ts` — `CliDepOptions` interface (line 42-60), constructs all module deps
- `packages/franken-orchestrator/src/beasts/types.ts:51-69` — `BeastRun` interface, `configSnapshot` field
- `docs/adr/029-config-file-passthrough-spawned-agents.md` — design rationale

---

## Current State

`ProcessBeastExecutor.start()` passes module config as `FRANKENBEAST_MODULE_*` env vars (line 7-17, `moduleConfigToEnv`). No other wizard config reaches the spawned process — LLM overrides, git presets, skills, and prompts are lost.

`config-loader.ts` loads `OrchestratorConfig` with fields like `maxCritiqueIterations`, `maxTotalTokens`, `providers` — a completely different shape from the wizard config. **RunConfigLoader must be a separate file with a separate schema.**

`dep-factory.ts` takes `CliDepOptions` which includes `provider`, `budget`, `baseBranch`, etc. — these come from CLI args today. RunConfig extends this.

---

## Tasks

### Task 1: Create RunConfigSchema and RunConfigLoader

- [ ] **Step 1: Write the failing test**

Create `packages/franken-orchestrator/tests/unit/cli/run-config-loader.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadRunConfig, type RunConfig } from '../../../src/cli/run-config-loader.js';

describe('RunConfigLoader', () => {
  let workDir: string | undefined;

  afterEach(async () => {
    if (workDir) await rm(workDir, { recursive: true, force: true });
  });

  it('loads and validates a complete run config file', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'run-config-'));
    const configPath = join(workDir, 'run-config.json');
    await writeFile(configPath, JSON.stringify({
      provider: 'claude',
      model: 'claude-opus-4-6',
      maxTotalTokens: 200000,
      llmConfig: {
        default: { provider: 'anthropic', model: 'claude-opus-4-6' },
        overrides: {
          planning: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
        },
      },
      modules: { firewall: true, critique: true, governor: false },
      gitConfig: {
        preset: 'feature-branch',
        baseBranch: 'main',
      },
      skills: ['code-review', 'test-generation'],
      promptConfig: {
        text: 'Focus on type safety',
        files: ['/path/to/context.md'],
      },
    }));

    const config = await loadRunConfig(configPath);

    expect(config.provider).toBe('claude');
    expect(config.model).toBe('claude-opus-4-6');
    expect(config.llmConfig?.default?.provider).toBe('anthropic');
    expect(config.modules?.firewall).toBe(true);
    expect(config.modules?.governor).toBe(false);
    expect(config.gitConfig?.baseBranch).toBe('main');
    expect(config.skills).toEqual(['code-review', 'test-generation']);
    expect(config.promptConfig?.text).toBe('Focus on type safety');
  });

  it('handles minimal config (only required fields)', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'run-config-'));
    const configPath = join(workDir, 'run-config.json');
    await writeFile(configPath, JSON.stringify({
      provider: 'claude',
    }));

    const config = await loadRunConfig(configPath);

    expect(config.provider).toBe('claude');
    expect(config.llmConfig).toBeUndefined();
    expect(config.modules).toBeUndefined();
    expect(config.skills).toBeUndefined();
  });

  it('throws on invalid config (missing provider)', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'run-config-'));
    const configPath = join(workDir, 'run-config.json');
    await writeFile(configPath, JSON.stringify({ model: 'claude-opus-4-6' }));

    await expect(loadRunConfig(configPath)).rejects.toThrow();
  });

  it('throws on missing file', async () => {
    await expect(loadRunConfig('/nonexistent/config.json')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/franken-orchestrator && npx vitest run tests/unit/cli/run-config-loader.test.ts
```

Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement RunConfigLoader**

Create `packages/franken-orchestrator/src/cli/run-config-loader.ts`:

```typescript
import { readFile } from 'node:fs/promises';
import { z } from 'zod';

const LlmOverrideSchema = z.object({
  provider: z.string(),
  model: z.string(),
}).strict();

const LlmConfigSchema = z.object({
  default: LlmOverrideSchema.optional(),
  overrides: z.record(z.string(), LlmOverrideSchema).optional(),
}).strict();

const ModulesConfigSchema = z.object({
  firewall: z.boolean().optional(),
  skills: z.boolean().optional(),
  memory: z.boolean().optional(),
  planner: z.boolean().optional(),
  critique: z.boolean().optional(),
  governor: z.boolean().optional(),
  heartbeat: z.boolean().optional(),
}).strict();

const GitConfigSchema = z.object({
  preset: z.string().optional(),
  baseBranch: z.string().optional(),
  branchPattern: z.string().optional(),
  prCreation: z.boolean().optional(),
  mergeStrategy: z.string().optional(),
}).strict();

const PromptConfigSchema = z.object({
  text: z.string().optional(),
  files: z.array(z.string()).optional(),
}).strict();

export const RunConfigSchema = z.object({
  // Orchestrator-compatible fields
  provider: z.string(),
  model: z.string().optional(),
  maxTotalTokens: z.number().int().optional(),
  maxDurationMs: z.number().int().optional(),
  objective: z.string().optional(),

  // Wizard-specific fields
  llmConfig: LlmConfigSchema.optional(),
  modules: ModulesConfigSchema.optional(),
  gitConfig: GitConfigSchema.optional(),
  skills: z.array(z.string()).optional(),
  promptConfig: PromptConfigSchema.optional(),
});

export type RunConfig = z.infer<typeof RunConfigSchema>;

/**
 * Loads and validates a run config JSON file.
 * This is NOT the same as config-loader.ts (which loads OrchestratorConfig).
 * See ADR-029 for design rationale.
 */
export async function loadRunConfig(filePath: string): Promise<RunConfig> {
  const raw = await readFile(filePath, 'utf-8');
  const parsed = JSON.parse(raw);
  return RunConfigSchema.parse(parsed);
}

/**
 * Tries to load run config from FRANKENBEAST_RUN_CONFIG env var.
 * Returns undefined if env var is not set.
 */
export async function loadRunConfigFromEnv(): Promise<RunConfig | undefined> {
  const configPath = process.env.FRANKENBEAST_RUN_CONFIG;
  if (!configPath) return undefined;
  return loadRunConfig(configPath);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/franken-orchestrator && npx vitest run tests/unit/cli/run-config-loader.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/cli/run-config-loader.ts packages/franken-orchestrator/tests/unit/cli/run-config-loader.test.ts
git commit -m "feat(beasts): add RunConfigLoader with Zod schema for wizard config passthrough"
```

---

### Task 2: Write config file before spawn in ProcessBeastExecutor

- [ ] **Step 1: Write the failing test**

Create `packages/franken-orchestrator/tests/unit/beasts/execution/config-passthrough.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import { vi } from 'vitest';
import { ProcessBeastExecutor } from '../../../../src/beasts/execution/process-beast-executor.js';
import { SQLiteBeastRepository } from '../../../../src/beasts/repository/sqlite-beast-repository.js';
import { BeastLogStore } from '../../../../src/beasts/events/beast-log-store.js';
import { martinLoopDefinition } from '../../../../src/beasts/definitions/martin-loop-definition.js';

describe('Config file passthrough', () => {
  let workDir: string | undefined;

  afterEach(async () => {
    if (workDir) await rm(workDir, { recursive: true, force: true });
  });

  it('writes config snapshot to JSON file and passes path via FRANKENBEAST_RUN_CONFIG env', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-config-pass-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const logs = new BeastLogStore(join(workDir, 'logs'));

    let capturedEnv: Record<string, string> | undefined;
    const supervisor = {
      spawn: vi.fn(async (spec: any, _callbacks: any) => {
        capturedEnv = spec.env;
        return { pid: 9999 };
      }),
      stop: vi.fn(async () => {}),
      kill: vi.fn(async () => {}),
    };

    const configSnapshot = {
      provider: 'claude',
      objective: 'Build feature X',
      chunkDirectory: './chunks',
      llmConfig: {
        default: { provider: 'anthropic', model: 'claude-opus-4-6' },
      },
      modules: { firewall: true, critique: false },
    };

    const executor = new ProcessBeastExecutor(repo, logs, supervisor);
    const run = repo.createRun({
      definitionId: 'martin-loop',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot,
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'pfk',
      createdAt: new Date().toISOString(),
    });

    await executor.start(run, martinLoopDefinition);

    // Verify FRANKENBEAST_RUN_CONFIG was set in spawned env
    expect(capturedEnv?.FRANKENBEAST_RUN_CONFIG).toBeDefined();
    const configPath = capturedEnv!.FRANKENBEAST_RUN_CONFIG;
    expect(existsSync(configPath)).toBe(true);

    // Verify config file content
    const content = JSON.parse(await readFile(configPath, 'utf-8'));
    expect(content.provider).toBe('claude');
    expect(content.llmConfig.default.provider).toBe('anthropic');
    expect(content.modules.firewall).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/franken-orchestrator && npx vitest run tests/unit/beasts/execution/config-passthrough.test.ts
```

Expected: FAIL — `FRANKENBEAST_RUN_CONFIG` not set in env.

- [ ] **Step 3: Update ProcessBeastExecutor.start() to write config file**

Add to the top of `process-beast-executor.ts`:

```typescript
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
```

In `start()`, before calling `this.supervisor.spawn()`:

```typescript
// Write config snapshot to JSON file for the spawned process
const configDir = join(process.cwd(), '.frankenbeast', '.build', 'run-configs');
mkdirSync(configDir, { recursive: true });
const configFilePath = join(configDir, `${run.id}.json`);
writeFileSync(configFilePath, JSON.stringify(run.configSnapshot, null, 2), 'utf-8');

// Add config file path to spawned env
const mergedSpec = {
  ...processSpec,
  env: {
    ...processSpec.env,
    ...moduleEnv,
    FRANKENBEAST_RUN_CONFIG: configFilePath,
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/franken-orchestrator && npx vitest run tests/unit/beasts/execution/config-passthrough.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/beasts/execution/process-beast-executor.ts packages/franken-orchestrator/tests/unit/beasts/execution/config-passthrough.test.ts
git commit -m "feat(beasts): write configSnapshot to JSON file before spawn, pass via FRANKENBEAST_RUN_CONFIG"
```

---

### Task 3: Add config file cleanup on terminal state

- [ ] **Step 1: Write the failing test — config file deleted on completion**

Add to `config-passthrough.test.ts`:

```typescript
it('deletes config file when run reaches terminal state', async () => {
  workDir = await mkdtemp(join(tmpdir(), 'franken-config-cleanup-'));
  const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
  const logs = new BeastLogStore(join(workDir, 'logs'));

  let capturedCallbacks: any;
  let capturedEnv: Record<string, string> | undefined;
  const supervisor = {
    spawn: vi.fn(async (spec: any, callbacks: any) => {
      capturedCallbacks = callbacks;
      capturedEnv = spec.env;
      return { pid: 8888 };
    }),
    stop: vi.fn(async () => {}),
    kill: vi.fn(async () => {}),
  };

  const executor = new ProcessBeastExecutor(repo, logs, supervisor);
  const run = repo.createRun({
    definitionId: 'martin-loop',
    definitionVersion: 1,
    executionMode: 'process',
    configSnapshot: { provider: 'claude', objective: 'test', chunkDirectory: './chunks' },
    dispatchedBy: 'cli',
    dispatchedByUser: 'pfk',
    createdAt: new Date().toISOString(),
  });

  await executor.start(run, martinLoopDefinition);
  const configPath = capturedEnv!.FRANKENBEAST_RUN_CONFIG;
  expect(existsSync(configPath)).toBe(true);

  // Simulate process exit
  capturedCallbacks.onExit(0, null);
  await new Promise((r) => setTimeout(r, 200));

  expect(existsSync(configPath)).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/franken-orchestrator && npx vitest run tests/unit/beasts/execution/config-passthrough.test.ts
```

Expected: FAIL — config file still exists after exit.

- [ ] **Step 3: Add cleanup to handleProcessExit**

In `process-beast-executor.ts`, import `unlinkSync`:

```typescript
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
```

Store the config file path as an instance field or capture in closure. In `start()`, store the path:

```typescript
// After writing config file, store for cleanup
this.configFilePaths.set(run.id, configFilePath);
```

Add `private readonly configFilePaths = new Map<string, string>();` to the class.

In `handleProcessExit`, add cleanup at the end:

```typescript
// Clean up config file
const configPath = this.configFilePaths.get(runId);
if (configPath) {
  try { unlinkSync(configPath); } catch { /* ignore if already gone */ }
  this.configFilePaths.delete(runId);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/franken-orchestrator && npx vitest run tests/unit/beasts/execution/config-passthrough.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/beasts/execution/process-beast-executor.ts packages/franken-orchestrator/tests/unit/beasts/execution/config-passthrough.test.ts
git commit -m "feat(beasts): clean up config file on process exit"
```

---

### Task 4: Wire RunConfig into dep-factory.ts

- [ ] **Step 1: Read `dep-factory.ts` fully to understand the CliDepOptions interface**

Read the complete file to understand how deps are constructed and where RunConfig fields should be injected.

- [ ] **Step 2: Add optional RunConfig to CliDepOptions**

In `dep-factory.ts`, add to the `CliDepOptions` interface:

```typescript
/** Run config loaded from FRANKENBEAST_RUN_CONFIG (wizard config passthrough). */
runConfig?: RunConfig | undefined;
```

Add the import:

```typescript
import type { RunConfig } from './run-config-loader.js';
```

- [ ] **Step 3: Use RunConfig to override provider/budget where applicable**

In the dep factory function, where `provider` is used:

```typescript
// If runConfig provides LLM overrides, use them
const effectiveProvider = opts.runConfig?.llmConfig?.default?.provider ?? opts.provider;
const effectiveModel = opts.runConfig?.llmConfig?.default?.model;
```

Where `baseBranch` is used:

```typescript
const effectiveBranch = opts.runConfig?.gitConfig?.baseBranch ?? opts.baseBranch;
```

Where budget is used:

```typescript
const effectiveBudget = opts.runConfig?.maxTotalTokens ?? opts.budget;
```

**Note:** The exact wiring points depend on the full dep-factory structure. Read the file completely before making changes. The goal is to thread RunConfig values through existing code paths without restructuring.

- [ ] **Step 4: Run full test suite**

```bash
cd packages/franken-orchestrator && npx vitest run
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/cli/dep-factory.ts
git commit -m "feat(beasts): wire RunConfig into dep-factory for LLM/git/module overrides"
```

---

### Task 5: Load RunConfig in session.ts startup path

- [ ] **Step 1: Read `session.ts` to find where config is loaded**

Identify the startup path where `loadConfig(args)` is called and where `CliDepOptions` is constructed.

- [ ] **Step 2: Add RunConfig loading after standard config load**

At the point where `CliDepOptions` is assembled, add:

```typescript
import { loadRunConfigFromEnv } from './run-config-loader.js';

// After existing config loading:
const runConfig = await loadRunConfigFromEnv();
```

Pass it through to `CliDepOptions`:

```typescript
const depOpts: CliDepOptions = {
  // ... existing fields ...
  runConfig,
};
```

- [ ] **Step 3: Run full test suite**

```bash
cd packages/franken-orchestrator && npx vitest run
cd packages/franken-orchestrator && npx tsc --noEmit
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/franken-orchestrator/src/cli/session.ts
git commit -m "feat(beasts): load RunConfig from FRANKENBEAST_RUN_CONFIG in session startup"
```

---

## Success Criteria

1. `ProcessBeastExecutor.start()` writes `configSnapshot` to `.frankenbeast/.build/run-configs/<runId>.json`
2. Spawned process env includes `FRANKENBEAST_RUN_CONFIG=<path>`
3. `RunConfigLoader` parses and validates the file with Zod
4. `RunConfig` fields override defaults in `dep-factory.ts` (provider, model, budget, baseBranch)
5. Config file is cleaned up when run reaches terminal state
6. All existing tests pass

## Verification

```bash
cd packages/franken-orchestrator && npx vitest run tests/unit/cli/run-config-loader.test.ts
cd packages/franken-orchestrator && npx vitest run tests/unit/beasts/execution/config-passthrough.test.ts
cd packages/franken-orchestrator && npx vitest run
cd packages/franken-orchestrator && npx tsc --noEmit
```
