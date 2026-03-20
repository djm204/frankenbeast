# Chunk 03: Real buildProcessSpec Implementations

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stub `buildProcessSpec` implementations in all three beast definitions with real CLI invocations that spawn `frankenbeast` subprocesses. Also create `resolveCliEntrypoint()` and fix `shouldDispatchOnCreate()` for design-interview.

**Spec section:** Plan 1, Section 3

**Depends on:** Chunk 01 (for ProcessCallbacks signature — definitions don't directly use it, but the executor that consumes their specs does)

---

## Files

- **Create:** `packages/franken-orchestrator/src/beasts/definitions/resolve-cli-entrypoint.ts`
- **Modify:** `packages/franken-orchestrator/src/beasts/definitions/martin-loop-definition.ts`
- **Modify:** `packages/franken-orchestrator/src/beasts/definitions/chunk-plan-definition.ts`
- **Modify:** `packages/franken-orchestrator/src/beasts/definitions/design-interview-definition.ts`
- **Modify:** `packages/franken-orchestrator/src/http/routes/agent-routes.ts` (line 361-362: `shouldDispatchOnCreate`)
- **Create:** `packages/franken-orchestrator/tests/unit/beasts/definitions/resolve-cli-entrypoint.test.ts`
- **Create:** `packages/franken-orchestrator/tests/unit/beasts/definitions/martin-loop-definition.test.ts`
- **Create:** `packages/franken-orchestrator/tests/unit/beasts/definitions/chunk-plan-definition.test.ts`
- **Create:** `packages/franken-orchestrator/tests/unit/beasts/definitions/design-interview-definition.test.ts`

---

## Context

Read these files before starting:

- `packages/franken-orchestrator/src/beasts/definitions/martin-loop-definition.ts` — current stub (line 36-43)
- `packages/franken-orchestrator/src/beasts/definitions/chunk-plan-definition.ts` — current stub (line 28-31)
- `packages/franken-orchestrator/src/beasts/definitions/design-interview-definition.ts` — current stub (line 28-31)
- `packages/franken-orchestrator/src/beasts/types.ts:32-37` — `BeastProcessSpec` interface
- `packages/franken-orchestrator/package.json` — `bin.frankenbeast` → `./dist/cli/run.js`
- `packages/franken-orchestrator/src/http/routes/agent-routes.ts:361-363` — `shouldDispatchOnCreate`
- `packages/franken-orchestrator/src/cli/session.ts` — entry points: `runExecute()`, `runPlan()`, `runInterview()`

---

## Current State

All three definitions return trivial stubs:

**martin-loop** (line 36-43):
```typescript
buildProcessSpec: (config) => ({
  command: 'node',
  args: ['-e', `console.log("martin-loop:${String(config.objective ?? '')}")`],
  env: {
    FRANKENBEAST_PROVIDER: String(config.provider ?? ''),
    FRANKENBEAST_CHUNK_DIRECTORY: String(config.chunkDirectory ?? ''),
  },
})
```

**chunk-plan** (line 28-31) — note: no `config` parameter (empty parens), though `BeastDefinition` interface requires one:
```typescript
buildProcessSpec: () => ({
  command: 'node',
  args: ['-e', 'setTimeout(() => process.exit(0), 50)'],
})
```

**design-interview** (line 28-31): Same stub, also missing `config` parameter.

Both must change from `() =>` to `(config) =>` to actually read config values.

`shouldDispatchOnCreate` (agent-routes.ts line 361-362):
```typescript
function shouldDispatchOnCreate(kind): boolean {
  return kind === 'chunk-plan' || kind === 'martin-loop';
}
```
Returns `false` for `design-interview`, preventing auto-dispatch from the wizard.

---

## Tasks

### Task 1: Create resolveCliEntrypoint utility

- [ ] **Step 1: Write the failing test**

Create `packages/franken-orchestrator/tests/unit/beasts/definitions/resolve-cli-entrypoint.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { resolveCliEntrypoint } from '../../../../src/beasts/definitions/resolve-cli-entrypoint.js';
import { existsSync } from 'node:fs';

describe('resolveCliEntrypoint', () => {
  it('returns an absolute path', () => {
    const entrypoint = resolveCliEntrypoint();
    expect(entrypoint).toMatch(/^\//); // absolute path
  });

  it('returns a path ending with cli/run.js', () => {
    const entrypoint = resolveCliEntrypoint();
    expect(entrypoint).toMatch(/cli\/run\.(js|ts)$/);
  });

  it('resolves to an existing file', () => {
    const entrypoint = resolveCliEntrypoint();
    expect(existsSync(entrypoint)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/franken-orchestrator && npx vitest run tests/unit/beasts/definitions/resolve-cli-entrypoint.test.ts
```

Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement resolveCliEntrypoint**

Create `packages/franken-orchestrator/src/beasts/definitions/resolve-cli-entrypoint.ts`:

```typescript
import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Resolves the absolute path to the CLI entrypoint (run.js).
 * Prefers the built dist/ path. Falls back to src/ .ts path for dev/test
 * contexts (requires tsx or ts-node to execute).
 */
export function resolveCliEntrypoint(): string {
  // In dist: this file is at dist/beasts/definitions/resolve-cli-entrypoint.js
  // CLI entrypoint is at dist/cli/run.js — preferred (node can execute directly)
  const distPath = resolve(__dirname, '../../cli/run.js');
  if (existsSync(distPath)) {
    return distPath;
  }

  // In src (dev/test): this file is at src/beasts/definitions/resolve-cli-entrypoint.ts
  // CLI entrypoint is at src/cli/run.ts
  // NOTE: When this path is used, the spawner must use tsx/ts-node instead of
  // bare node, OR the project must be built first. In production, dist/ always exists.
  const srcPath = resolve(__dirname, '../../cli/run.ts');
  if (existsSync(srcPath)) {
    return srcPath;
  }

  throw new Error(
    `Cannot resolve CLI entrypoint. Looked at:\n  ${distPath}\n  ${srcPath}`,
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/franken-orchestrator && npx vitest run tests/unit/beasts/definitions/resolve-cli-entrypoint.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/beasts/definitions/resolve-cli-entrypoint.ts packages/franken-orchestrator/tests/unit/beasts/definitions/resolve-cli-entrypoint.test.ts
git commit -m "feat(beasts): add resolveCliEntrypoint utility"
```

---

### Task 2: Update martin-loop definition

- [ ] **Step 1: Write the failing test**

Create `packages/franken-orchestrator/tests/unit/beasts/definitions/martin-loop-definition.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { martinLoopDefinition } from '../../../../src/beasts/definitions/martin-loop-definition.js';

describe('martinLoopDefinition.buildProcessSpec', () => {
  it('spawns the frankenbeast CLI with run subcommand', () => {
    const spec = martinLoopDefinition.buildProcessSpec({
      provider: 'claude',
      objective: 'Build the feature',
      chunkDirectory: './plan-foo/chunks',
    });

    expect(spec.command).toBe(process.execPath);
    expect(spec.args).toContain('run');
    expect(spec.args).toContain('--provider');
    expect(spec.args).toContain('claude');
    expect(spec.args).toContain('--chunks');
    expect(spec.args).toContain('./plan-foo/chunks');
  });

  it('sets FRANKENBEAST_SPAWNED=1 in env', () => {
    const spec = martinLoopDefinition.buildProcessSpec({
      provider: 'claude',
      objective: 'test',
      chunkDirectory: './chunks',
    });

    expect(spec.env?.FRANKENBEAST_SPAWNED).toBe('1');
  });

  it('does not include CLAUDE_* env vars in spec env', () => {
    const spec = martinLoopDefinition.buildProcessSpec({
      provider: 'claude',
      objective: 'test',
      chunkDirectory: './chunks',
    });

    // Definition's env should only have FRANKENBEAST_SPAWNED.
    // CLAUDE_* stripping from process.env happens in ProcessSupervisor.spawn()
    // (implemented in Chunk 01 via stripClaudeEnvVars helper).
    expect(spec.env).toEqual({ FRANKENBEAST_SPAWNED: '1' });
  });

  it('uses projectRoot as cwd when provided', () => {
    const spec = martinLoopDefinition.buildProcessSpec({
      provider: 'claude',
      objective: 'test',
      chunkDirectory: './chunks',
      projectRoot: '/home/user/project',
    });

    expect(spec.cwd).toBe('/home/user/project');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/franken-orchestrator && npx vitest run tests/unit/beasts/definitions/martin-loop-definition.test.ts
```

Expected: FAIL — `spec.command` is `'node'` not `process.execPath`, args don't contain `'run'`.

- [ ] **Step 3: Update martin-loop buildProcessSpec**

In `martin-loop-definition.ts`, replace the `buildProcessSpec`:

```typescript
import { resolveCliEntrypoint } from './resolve-cli-entrypoint.js';

// ... inside the definition object:
buildProcessSpec: (config) => ({
  command: process.execPath,
  args: [
    resolveCliEntrypoint(),
    'run',
    '--provider', String(config.provider),
    '--chunks', String(config.chunkDirectory),
  ],
  env: {
    FRANKENBEAST_SPAWNED: '1',
  },
  cwd: String(config.projectRoot ?? process.cwd()),
}),
```

Remove the old `FRANKENBEAST_PROVIDER` and `FRANKENBEAST_CHUNK_DIRECTORY` env vars — those are now passed as CLI args. The spawned process reads them via its own arg parser.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/franken-orchestrator && npx vitest run tests/unit/beasts/definitions/martin-loop-definition.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/beasts/definitions/martin-loop-definition.ts packages/franken-orchestrator/tests/unit/beasts/definitions/martin-loop-definition.test.ts
git commit -m "feat(beasts): replace martin-loop stub with real CLI spawn"
```

---

### Task 3: Update chunk-plan definition

- [ ] **Step 1: Write the failing test**

Create `packages/franken-orchestrator/tests/unit/beasts/definitions/chunk-plan-definition.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { chunkPlanDefinition } from '../../../../src/beasts/definitions/chunk-plan-definition.js';

describe('chunkPlanDefinition.buildProcessSpec', () => {
  it('spawns the frankenbeast CLI with plan subcommand', () => {
    const spec = chunkPlanDefinition.buildProcessSpec({
      designDocPath: './docs/design.md',
      outputDir: './plan-chunks/',
    });

    expect(spec.command).toBe(process.execPath);
    expect(spec.args).toContain('plan');
    expect(spec.args).toContain('--design-doc');
    expect(spec.args).toContain('./docs/design.md');
    expect(spec.args).toContain('--output-dir');
    expect(spec.args).toContain('./plan-chunks/');
  });

  it('sets FRANKENBEAST_SPAWNED=1 in env', () => {
    const spec = chunkPlanDefinition.buildProcessSpec({
      designDocPath: './design.md',
      outputDir: './out/',
    });

    expect(spec.env?.FRANKENBEAST_SPAWNED).toBe('1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/franken-orchestrator && npx vitest run tests/unit/beasts/definitions/chunk-plan-definition.test.ts
```

Expected: FAIL

- [ ] **Step 3: Update chunk-plan buildProcessSpec**

In `chunk-plan-definition.ts`:

```typescript
import { resolveCliEntrypoint } from './resolve-cli-entrypoint.js';

// ... inside the definition object:
buildProcessSpec: (config) => ({
  command: process.execPath,
  args: [
    resolveCliEntrypoint(),
    'plan',
    '--design-doc', String(config.designDocPath),
    '--output-dir', String(config.outputDir),
  ],
  env: {
    FRANKENBEAST_SPAWNED: '1',
  },
}),
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/franken-orchestrator && npx vitest run tests/unit/beasts/definitions/chunk-plan-definition.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/beasts/definitions/chunk-plan-definition.ts packages/franken-orchestrator/tests/unit/beasts/definitions/chunk-plan-definition.test.ts
git commit -m "feat(beasts): replace chunk-plan stub with real CLI spawn"
```

---

### Task 4: Update design-interview definition

- [ ] **Step 1: Write the failing test**

Create `packages/franken-orchestrator/tests/unit/beasts/definitions/design-interview-definition.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { designInterviewDefinition } from '../../../../src/beasts/definitions/design-interview-definition.js';

describe('designInterviewDefinition.buildProcessSpec', () => {
  it('spawns the frankenbeast CLI with interview subcommand', () => {
    const spec = designInterviewDefinition.buildProcessSpec({
      goal: 'Design the auth system',
      outputPath: './docs/auth-design.md',
    });

    expect(spec.command).toBe(process.execPath);
    expect(spec.args).toContain('interview');
    expect(spec.args).toContain('--goal');
    expect(spec.args).toContain('Design the auth system');
    expect(spec.args).toContain('--output');
    expect(spec.args).toContain('./docs/auth-design.md');
  });

  it('sets FRANKENBEAST_SPAWNED=1 in env', () => {
    const spec = designInterviewDefinition.buildProcessSpec({
      goal: 'test',
      outputPath: './out.md',
    });

    expect(spec.env?.FRANKENBEAST_SPAWNED).toBe('1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/franken-orchestrator && npx vitest run tests/unit/beasts/definitions/design-interview-definition.test.ts
```

Expected: FAIL

- [ ] **Step 3: Update design-interview buildProcessSpec**

In `design-interview-definition.ts`:

```typescript
import { resolveCliEntrypoint } from './resolve-cli-entrypoint.js';

// ... inside the definition object:
buildProcessSpec: (config) => ({
  command: process.execPath,
  args: [
    resolveCliEntrypoint(),
    'interview',
    '--goal', String(config.goal),
    '--output', String(config.outputPath),
  ],
  env: {
    FRANKENBEAST_SPAWNED: '1',
  },
}),
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/franken-orchestrator && npx vitest run tests/unit/beasts/definitions/design-interview-definition.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/beasts/definitions/design-interview-definition.ts packages/franken-orchestrator/tests/unit/beasts/definitions/design-interview-definition.test.ts
git commit -m "feat(beasts): replace design-interview stub with real CLI spawn"
```

---

### Task 5: Fix shouldDispatchOnCreate for design-interview

- [ ] **Step 1: Verify the current behavior returns false for design-interview**

Read `packages/franken-orchestrator/src/http/routes/agent-routes.ts` line 361-363 and confirm:
```typescript
function shouldDispatchOnCreate(kind): boolean {
  return kind === 'chunk-plan' || kind === 'martin-loop';
}
```

- [ ] **Step 2: Update shouldDispatchOnCreate to include design-interview**

In `agent-routes.ts`, change line 361-363 to:

```typescript
function shouldDispatchOnCreate(kind: z.infer<typeof CreateAgentBody>['initAction']['kind']): boolean {
  return kind === 'chunk-plan' || kind === 'martin-loop' || kind === 'design-interview';
}
```

- [ ] **Step 3: Run existing agent-routes tests to ensure no regression**

```bash
cd packages/franken-orchestrator && npx vitest run tests/unit --reporter=verbose 2>&1 | grep -i agent
```

- [ ] **Step 4: Commit**

```bash
git add packages/franken-orchestrator/src/http/routes/agent-routes.ts
git commit -m "fix(beasts): enable auto-dispatch for design-interview definition"
```

---

### Task 6: Verify full test suite

- [ ] **Step 1: Run all orchestrator tests**

```bash
cd packages/franken-orchestrator && npx vitest run
```

Expected: All tests pass. The existing `process-beast-executor.test.ts` still uses the old stub definition — this is fine since the mock supervisor doesn't actually run the process.

- [ ] **Step 2: Run typecheck**

```bash
cd packages/franken-orchestrator && npx tsc --noEmit
```

Expected: Clean.

- [ ] **Step 3: Commit if any fixes were needed**

```bash
git add -A && git commit -m "fix(beasts): resolve any issues from buildProcessSpec updates"
```

---

## Success Criteria

1. `resolveCliEntrypoint()` returns absolute path to `cli/run.js` or `cli/run.ts`
2. `martin-loop` spawns `frankenbeast run --provider X --chunks Y`
3. `chunk-plan` spawns `frankenbeast plan --design-doc X --output-dir Y`
4. `design-interview` spawns `frankenbeast interview --goal X --output Y`
5. All three set `FRANKENBEAST_SPAWNED=1` in env
6. `shouldDispatchOnCreate` returns `true` for all three definition types
7. All existing tests pass

## Verification

```bash
cd packages/franken-orchestrator && npx vitest run tests/unit/beasts/definitions/
cd packages/franken-orchestrator && npx vitest run
```
