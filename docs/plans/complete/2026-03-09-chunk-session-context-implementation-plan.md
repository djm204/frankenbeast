# Chunk Session Context Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace one-shot chunk execution with durable provider-agnostic chunk sessions that preserve context across iterations, compact safely at 85% context usage, checkpoint before compaction, and clean up session artifacts correctly.

**Architecture:** Add a canonical `ChunkSession` persisted under `.frankenbeast/.build/`, plus a session renderer, compactor, snapshot store, and GC service. `MartinLoop` becomes a session-aware runner, the observer estimates context-window usage and triggers compaction, and provider-native `--continue` is used only as an optimization when the active provider remains stable.

**Tech Stack:** TypeScript, Node.js ESM, Vitest, existing orchestrator CLI/provider abstractions, `.frankenbeast/.build` artifact layout

---

### Task 1: Define chunk-session types and file layout

**Files:**
- Create: `packages/franken-orchestrator/src/session/chunk-session.ts`
- Modify: `packages/franken-orchestrator/src/cli/project-root.ts`
- Test: `packages/franken-orchestrator/tests/unit/session/chunk-session.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { createChunkSession, createChunkTranscriptEntry } from '../../../src/session/chunk-session.js';
import { getProjectPaths } from '../../../src/cli/project-root.js';

describe('chunk-session', () => {
  it('creates a new active session with 85% compact threshold', () => {
    const session = createChunkSession({
      planName: 'demo-plan',
      taskId: 'impl:01_demo',
      chunkId: '01_demo',
      promiseTag: 'IMPL_01_demo_DONE',
      workingDir: '/tmp/demo',
      provider: 'claude',
      maxTokens: 200000,
    });

    expect(session.status).toBe('active');
    expect(session.contextWindow.compactThreshold).toBe(0.85);
    expect(session.transcript).toEqual([]);
  });

  it('adds build paths for chunk sessions and snapshots', () => {
    const paths = getProjectPaths('/tmp/project', 'demo-plan');
    expect(paths.chunkSessionsDir.endsWith('.frankenbeast/.build/chunk-sessions')).toBe(true);
    expect(paths.chunkSessionSnapshotsDir.endsWith('.frankenbeast/.build/chunk-session-snapshots')).toBe(true);
  });

  it('creates normalized transcript entries with timestamps', () => {
    const entry = createChunkTranscriptEntry('objective', 'implement the feature');
    expect(entry.kind).toBe('objective');
    expect(entry.content).toContain('implement');
    expect(entry.createdAt).toMatch(/T/);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/session/chunk-session.test.ts`
Expected: FAIL because `src/session/chunk-session.ts` and the new `ProjectPaths` fields do not exist yet.

**Step 3: Write minimal implementation**

Create `src/session/chunk-session.ts` with:

```typescript
export type ChunkTranscriptKind =
  | 'system'
  | 'objective'
  | 'assistant'
  | 'tool_summary'
  | 'compaction_summary'
  | 'checkpoint'
  | 'error';

export interface ChunkTranscriptEntry {
  readonly kind: ChunkTranscriptKind;
  readonly content: string;
  readonly createdAt: string;
}

export interface ChunkSession {
  readonly version: 1;
  readonly sessionId: string;
  readonly planName: string;
  readonly taskId: string;
  readonly chunkId: string;
  readonly promiseTag: string;
  readonly workingDir: string;
  readonly status: 'active' | 'completed' | 'failed' | 'abandoned';
  readonly iterations: number;
  readonly compactionGeneration: number;
  readonly activeProvider?: string;
  readonly lastKnownGoodCommit?: string;
  readonly contextWindow: {
    readonly provider: string;
    readonly usedTokens: number;
    readonly maxTokens: number;
    readonly usageRatio: number;
    readonly compactThreshold: number;
    readonly lastCompactedAtIteration?: number;
  };
  readonly transcript: readonly ChunkTranscriptEntry[];
  readonly compactions: readonly {
    readonly generation: number;
    readonly summary: string;
    readonly createdAt: string;
  }[];
  readonly createdAt: string;
  readonly updatedAt: string;
}
```

Update `getProjectPaths()` to expose:

```typescript
chunkSessionsDir: resolve(buildDir, 'chunk-sessions'),
chunkSessionSnapshotsDir: resolve(buildDir, 'chunk-session-snapshots'),
```

**Step 4: Run test to verify it passes**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/session/chunk-session.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/session/chunk-session.ts \
  packages/franken-orchestrator/src/cli/project-root.ts \
  packages/franken-orchestrator/tests/unit/session/chunk-session.test.ts
git commit -m "feat(orchestrator): define chunk session model and paths"
```

---

### Task 2: Add chunk-session store and snapshot store

**Files:**
- Create: `packages/franken-orchestrator/src/session/chunk-session-store.ts`
- Create: `packages/franken-orchestrator/src/session/chunk-session-snapshot-store.ts`
- Test: `packages/franken-orchestrator/tests/unit/session/chunk-session-store.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileChunkSessionStore } from '../../../src/session/chunk-session-store.js';
import { FileChunkSessionSnapshotStore } from '../../../src/session/chunk-session-snapshot-store.js';
import { createChunkSession } from '../../../src/session/chunk-session.js';

describe('FileChunkSessionStore', () => {
  it('writes and reloads a chunk session by plan/chunk id', () => {
    const root = mkdtempSync(join(tmpdir(), 'chunk-session-'));
    const store = new FileChunkSessionStore(root);
    const session = createChunkSession({
      planName: 'demo-plan',
      taskId: 'impl:01_demo',
      chunkId: '01_demo',
      promiseTag: 'IMPL_01_demo_DONE',
      workingDir: root,
      provider: 'claude',
      maxTokens: 200000,
    });

    store.save(session);
    const loaded = store.load('demo-plan', '01_demo');

    expect(loaded?.chunkId).toBe('01_demo');
  });

  it('writes immutable snapshots before compaction', () => {
    const root = mkdtempSync(join(tmpdir(), 'chunk-snapshot-'));
    const snapshots = new FileChunkSessionSnapshotStore(root);
    const session = createChunkSession({
      planName: 'demo-plan',
      taskId: 'impl:01_demo',
      chunkId: '01_demo',
      promiseTag: 'IMPL_01_demo_DONE',
      workingDir: root,
      provider: 'claude',
      maxTokens: 200000,
    });

    const file = snapshots.writeSnapshot(session, 'pre-compaction');
    expect(file).toContain('01_demo');
    expect(snapshots.list('demo-plan', '01_demo')).toHaveLength(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/session/chunk-session-store.test.ts`
Expected: FAIL because the stores do not exist yet.

**Step 3: Write minimal implementation**

Implement:

- `FileChunkSessionStore.save(session)` using JSON write to `<root>/<plan>/<chunk>.json`
- `load(planName, chunkId)` returning `ChunkSession | undefined`
- `delete(planName, chunkId)`
- `list(planName?)`
- `FileChunkSessionSnapshotStore.writeSnapshot(session, reason)`
- `list(planName, chunkId)`
- `restoreLatest(planName, chunkId)`

Keep it simple and synchronous first, matching the existing checkpoint store style.

**Step 4: Run the store tests**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/session/chunk-session-store.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/session/chunk-session-store.ts \
  packages/franken-orchestrator/src/session/chunk-session-snapshot-store.ts \
  packages/franken-orchestrator/tests/unit/session/chunk-session-store.test.ts
git commit -m "feat(orchestrator): add chunk session persistence and snapshots"
```

---

### Task 3: Add provider capabilities and session renderer

**Files:**
- Modify: `packages/franken-orchestrator/src/skills/providers/cli-provider.ts`
- Modify: `packages/franken-orchestrator/src/skills/providers/claude-provider.ts`
- Modify: `packages/franken-orchestrator/src/skills/providers/codex-provider.ts`
- Modify: `packages/franken-orchestrator/src/skills/providers/gemini-provider.ts`
- Modify: `packages/franken-orchestrator/src/skills/providers/aider-provider.ts`
- Create: `packages/franken-orchestrator/src/session/chunk-session-renderer.ts`
- Test: `packages/franken-orchestrator/tests/unit/session/chunk-session-renderer.test.ts`
- Test: `packages/franken-orchestrator/tests/unit/skills/providers/cli-provider.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { ChunkSessionRenderer } from '../../../src/session/chunk-session-renderer.js';
import { ClaudeProvider } from '../../../src/skills/providers/claude-provider.js';
import { CodexProvider } from '../../../src/skills/providers/codex-provider.js';
import { createChunkSession } from '../../../src/session/chunk-session.js';

describe('ChunkSessionRenderer', () => {
  it('replays canonical session state for providers without native resume', () => {
    const renderer = new ChunkSessionRenderer();
    const session = createChunkSession({
      planName: 'demo-plan',
      taskId: 'impl:01_demo',
      chunkId: '01_demo',
      promiseTag: 'IMPL_01_demo_DONE',
      workingDir: '/tmp/demo',
      provider: 'codex',
      maxTokens: 128000,
    });

    const rendered = renderer.render(session, new CodexProvider());
    expect(rendered.prompt).toContain('IMPL_01_demo_DONE');
    expect(rendered.sessionContinue).toBe(false);
  });

  it('enables native continuation only when provider supports it and did not switch', () => {
    const renderer = new ChunkSessionRenderer();
    const session = {
      ...createChunkSession({
        planName: 'demo-plan',
        taskId: 'impl:01_demo',
        chunkId: '01_demo',
        promiseTag: 'IMPL_01_demo_DONE',
        workingDir: '/tmp/demo',
        provider: 'claude',
        maxTokens: 200000,
      }),
      activeProvider: 'claude',
      iterations: 2,
    };

    const rendered = renderer.render(session, new ClaudeProvider());
    expect(rendered.sessionContinue).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/session/chunk-session-renderer.test.ts tests/unit/skills/providers/cli-provider.test.ts`
Expected: FAIL because the renderer and capability fields do not exist yet.

**Step 3: Write minimal implementation**

Extend `ICliProvider` with a capability method or field:

```typescript
supportsNativeSessionResume(): boolean;
defaultContextWindowTokens(): number;
```

Implement `ChunkSessionRenderer.render(session, provider)` to return:

```typescript
{
  prompt: string;
  sessionContinue: boolean;
  maxTurns: number;
  model?: string;
}
```

Rules:

- `sessionContinue` is `true` only when `provider.supportsNativeSessionResume()` and `session.activeProvider === provider.name` and `session.iterations > 0`
- otherwise render full replay prompt from canonical transcript plus current objective/promise tag

**Step 4: Run tests**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/session/chunk-session-renderer.test.ts tests/unit/skills/providers/cli-provider.test.ts tests/unit/skills/providers/claude-provider.test.ts tests/unit/skills/providers/codex-provider.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/skills/providers/cli-provider.ts \
  packages/franken-orchestrator/src/skills/providers/claude-provider.ts \
  packages/franken-orchestrator/src/skills/providers/codex-provider.ts \
  packages/franken-orchestrator/src/skills/providers/gemini-provider.ts \
  packages/franken-orchestrator/src/skills/providers/aider-provider.ts \
  packages/franken-orchestrator/src/session/chunk-session-renderer.ts \
  packages/franken-orchestrator/tests/unit/session/chunk-session-renderer.test.ts
git commit -m "feat(orchestrator): render canonical chunk sessions for providers"
```

---

### Task 4: Extend observer bridge with context-window estimation

**Files:**
- Modify: `packages/franken-orchestrator/src/adapters/cli-observer-bridge.ts`
- Modify: `packages/franken-orchestrator/src/skills/cli-skill-executor.ts`
- Test: `packages/franken-orchestrator/tests/unit/adapters/cli-observer-bridge.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { CliObserverBridge } from '../../../src/adapters/cli-observer-bridge.js';

describe('CliObserverBridge context usage', () => {
  it('requests compaction when usage reaches 85 percent', () => {
    const bridge = new CliObserverBridge({ budgetLimitUsd: 5 });
    const usage = bridge.estimateContextWindow({
      renderedPrompt: 'x'.repeat(850),
      provider: 'claude',
      maxTokens: 1000,
    });

    expect(usage.usageRatio).toBeGreaterThanOrEqual(0.85);
    expect(usage.shouldCompact).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/adapters/cli-observer-bridge.test.ts`
Expected: FAIL because `estimateContextWindow()` does not exist.

**Step 3: Write minimal implementation**

Add a new method to `CliObserverBridge`:

```typescript
estimateContextWindow(input: {
  renderedPrompt: string;
  provider: string;
  maxTokens: number;
  threshold?: number;
}): ContextWindowUsage
```

Use a simple heuristic:

- `usedTokens = Math.ceil(renderedPrompt.length / 4)` for Claude/Gemini/Aider
- allow providers to override by passing `maxTokens` from their capability method
- `shouldCompact = usageRatio >= (threshold ?? 0.85)`

Expose this through the observer dependency surface used by `CliSkillExecutor`.

**Step 4: Run tests**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/adapters/cli-observer-bridge.test.ts tests/unit/skills/cli-skill-executor.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/adapters/cli-observer-bridge.ts \
  packages/franken-orchestrator/src/skills/cli-skill-executor.ts \
  packages/franken-orchestrator/tests/unit/adapters/cli-observer-bridge.test.ts
git commit -m "feat(observer): estimate chunk context window usage"
```

---

### Task 5: Add compactor and snapshot-before-compaction behavior

**Files:**
- Create: `packages/franken-orchestrator/src/session/chunk-session-compactor.ts`
- Modify: `packages/franken-orchestrator/src/session/chunk-session.ts`
- Test: `packages/franken-orchestrator/tests/unit/session/chunk-session-compactor.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { ChunkSessionCompactor } from '../../../src/session/chunk-session-compactor.js';
import { createChunkSession } from '../../../src/session/chunk-session.js';

describe('ChunkSessionCompactor', () => {
  it('replaces old transcript entries with a compaction summary and increments generation', async () => {
    const compactor = new ChunkSessionCompactor({
      summarize: async () => 'Summary: files touched and remaining objective.',
    });

    const session = {
      ...createChunkSession({
        planName: 'demo-plan',
        taskId: 'impl:01_demo',
        chunkId: '01_demo',
        promiseTag: 'IMPL_01_demo_DONE',
        workingDir: '/tmp/demo',
        provider: 'claude',
        maxTokens: 200000,
      }),
      transcript: [
        { kind: 'objective', content: 'build it', createdAt: new Date().toISOString() },
        { kind: 'assistant', content: 'working', createdAt: new Date().toISOString() },
      ],
    };

    const compacted = await compactor.compact(session);

    expect(compacted.compactionGeneration).toBe(1);
    expect(compacted.transcript.some((entry) => entry.kind === 'compaction_summary')).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/session/chunk-session-compactor.test.ts`
Expected: FAIL because the compactor does not exist.

**Step 3: Write minimal implementation**

Implement `ChunkSessionCompactor` with:

- injected `summarize(prompt: string): Promise<string>`
- `buildCompactionPrompt(session)`
- `compact(session)` that:
  - summarizes non-essential transcript history
  - preserves the latest objective, promise tag, and unresolved errors
  - appends a `compaction_summary`
  - increments `compactionGeneration`
  - updates `lastCompactedAtIteration`

Do not wire provider calls here yet; accept an injected summarizer function first.

**Step 4: Run tests**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/session/chunk-session-compactor.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/session/chunk-session-compactor.ts \
  packages/franken-orchestrator/src/session/chunk-session.ts \
  packages/franken-orchestrator/tests/unit/session/chunk-session-compactor.test.ts
git commit -m "feat(orchestrator): add chunk session compactor"
```

---

### Task 6: Refactor `MartinLoop` into a session-aware runner

**Files:**
- Modify: `packages/franken-orchestrator/src/skills/cli-types.ts`
- Modify: `packages/franken-orchestrator/src/skills/martin-loop.ts`
- Test: `packages/franken-orchestrator/tests/unit/skills/martin-loop.test.ts`

**Step 1: Write the failing test**

Add cases to `tests/unit/skills/martin-loop.test.ts` for:

```typescript
it('loads an existing chunk session and continues iterations from canonical state', async () => {
  // Seed a session with iterations=2 and transcript history
  // Verify MartinLoop renders from stored state instead of only raw prompt
});

it('creates a snapshot before compaction and resumes with compacted state', async () => {
  // Stub observer to return shouldCompact=true after first iteration
  // Verify snapshot store write and compactor invocation
});

it('falls back to replay when provider changes after a failure', async () => {
  // First provider errors, second provider succeeds
  // Verify sessionContinue=false for the second provider and transcript preserved
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/skills/martin-loop.test.ts`
Expected: FAIL because `MartinLoop` still only accepts raw prompt config.

**Step 3: Write minimal implementation**

Extend `MartinLoopConfig` with chunk-session dependencies:

```typescript
readonly planName?: string;
readonly taskId?: string;
readonly chunkId?: string;
readonly sessionStore?: ChunkSessionStore;
readonly snapshotStore?: ChunkSessionSnapshotStore;
readonly renderer?: ChunkSessionRenderer;
readonly compactor?: ChunkSessionCompactor;
readonly contextUsage?: ((prompt: string, provider: string) => ContextWindowUsage);
```

Refactor `MartinLoop.run()` to:

- load/create session before first provider spawn
- render prompt from canonical session
- append normalized output after each iteration
- call `contextUsage()`
- snapshot + compact when `shouldCompact` is true
- save session after each state transition

Keep the existing rate-limit cascade behavior intact.

**Step 4: Run tests**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/skills/martin-loop.test.ts tests/unit/skills/rate-limit-resilience.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/skills/cli-types.ts \
  packages/franken-orchestrator/src/skills/martin-loop.ts \
  packages/franken-orchestrator/tests/unit/skills/martin-loop.test.ts
git commit -m "feat(orchestrator): make MartinLoop chunk-session aware"
```

---

### Task 7: Wire chunk sessions into `CliSkillExecutor` and recovery

**Files:**
- Modify: `packages/franken-orchestrator/src/skills/cli-skill-executor.ts`
- Modify: `packages/franken-orchestrator/src/checkpoint/file-checkpoint-store.ts`
- Modify: `packages/franken-orchestrator/src/cli/dep-factory.ts`
- Test: `packages/franken-orchestrator/tests/unit/skills/cli-skill-executor.test.ts`
- Test: `packages/franken-orchestrator/tests/unit/file-checkpoint-store.test.ts`

**Step 1: Write the failing test**

Add cases for:

```typescript
it('passes plan/task/chunk session services into MartinLoop', async () => {
  // Verify execute() builds a config containing sessionStore/snapshotStore/renderer/compactor
});

it('records the last known good commit on the chunk session during recovery', async () => {
  // Simulate dirty-file recovery and assert chunk session metadata is updated
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/skills/cli-skill-executor.test.ts tests/unit/file-checkpoint-store.test.ts`
Expected: FAIL because the executor does not know about chunk sessions yet.

**Step 3: Write minimal implementation**

In `createCliDeps()`:

- instantiate `FileChunkSessionStore`
- instantiate `FileChunkSessionSnapshotStore`
- instantiate `ChunkSessionRenderer`
- instantiate `ChunkSessionCompactor`
- pass these into `CliSkillExecutor` or its Martin config defaults

In `CliSkillExecutor.execute()`:

- compute `planName`, `taskId`, `chunkId`
- seed session metadata such as `lastKnownGoodCommit`
- update session status to `completed` or `failed`

Keep existing git isolation and recovery semantics.

**Step 4: Run tests**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/skills/cli-skill-executor.test.ts tests/unit/file-checkpoint-store.test.ts tests/unit/execution-checkpoint.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/skills/cli-skill-executor.ts \
  packages/franken-orchestrator/src/checkpoint/file-checkpoint-store.ts \
  packages/franken-orchestrator/src/cli/dep-factory.ts \
  packages/franken-orchestrator/tests/unit/skills/cli-skill-executor.test.ts \
  packages/franken-orchestrator/tests/unit/file-checkpoint-store.test.ts
git commit -m "feat(orchestrator): wire chunk session execution and recovery"
```

---

### Task 8: Add chunk-session GC and recursive cleanup

**Files:**
- Create: `packages/franken-orchestrator/src/session/chunk-session-gc.ts`
- Modify: `packages/franken-orchestrator/src/cli/cleanup.ts`
- Modify: `packages/franken-orchestrator/src/cli/run.ts`
- Modify: `packages/franken-orchestrator/src/cli/dep-factory.ts`
- Test: `packages/franken-orchestrator/tests/unit/session/chunk-session-gc.test.ts`
- Test: `packages/franken-orchestrator/tests/unit/cli/run.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { cleanupBuild } from '../../../src/cli/cleanup.js';

describe('cleanupBuild', () => {
  it('removes nested chunk session directories', () => {
    const root = mkdtempSync(join(tmpdir(), 'cleanup-'));
    const nested = join(root, 'chunk-sessions', 'demo-plan');
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(nested, '01_demo.json'), '{}');

    const removed = cleanupBuild(root);

    expect(removed).toBeGreaterThan(0);
    expect(existsSync(nested)).toBe(false);
  });
});
```

Add a GC test that deletes expired `completed` sessions and orphaned snapshots but retains recent active ones.

**Step 2: Run test to verify it fails**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/session/chunk-session-gc.test.ts tests/unit/cli/run.test.ts`
Expected: FAIL because cleanup is not recursive and GC does not exist.

**Step 3: Write minimal implementation**

Implement `ChunkSessionGc` with:

- `collectExpiredSessions(now)`
- `collectOrphanedSnapshots()`

Use simple defaults:

- completed/abandoned retention: 24 hours
- failed retention: 72 hours
- active sessions are never removed by opportunistic GC

Refactor `cleanupBuild()` to recurse through directories and remove files/directories under `.build`.

Invoke GC from `createCliDeps()` or CLI startup/finalize, not from the hot loop.

**Step 4: Run tests**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/session/chunk-session-gc.test.ts tests/unit/cli/run.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/session/chunk-session-gc.ts \
  packages/franken-orchestrator/src/cli/cleanup.ts \
  packages/franken-orchestrator/src/cli/run.ts \
  packages/franken-orchestrator/src/cli/dep-factory.ts \
  packages/franken-orchestrator/tests/unit/session/chunk-session-gc.test.ts \
  packages/franken-orchestrator/tests/unit/cli/run.test.ts
git commit -m "feat(orchestrator): garbage collect and clean chunk sessions"
```

---

### Task 9: Add end-to-end coverage for compaction and resume

**Files:**
- Modify: `packages/franken-orchestrator/tests/e2e/cli-skill-execution.test.ts`
- Modify: `packages/franken-orchestrator/tests/unit/build-runner-integration.test.ts`

**Step 1: Write the failing test**

Add an E2E scenario:

```typescript
it('compacts a long-running chunk at 85 percent usage, snapshots first, then completes', async () => {
  // Use a fake provider whose output is long enough to trigger compaction
  // Assert snapshot file exists before compaction summary is written
  // Assert final result still detects the promise tag and chunk status is completed
});
```

Add an integration scenario where provider A fails after building history and provider B completes from canonical replay.

**Step 2: Run test to verify it fails**

Run: `cd packages/franken-orchestrator && npx vitest run tests/e2e/cli-skill-execution.test.ts tests/unit/build-runner-integration.test.ts`
Expected: FAIL until session-aware execution is wired end to end.

**Step 3: Implement the minimal plumbing needed**

Only after Tasks 1-8 are green, fill any remaining gaps discovered by the E2E tests. Prefer small fixes over new abstraction layers.

**Step 4: Run focused tests**

Run: `cd packages/franken-orchestrator && npx vitest run tests/e2e/cli-skill-execution.test.ts tests/unit/build-runner-integration.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/tests/e2e/cli-skill-execution.test.ts \
  packages/franken-orchestrator/tests/unit/build-runner-integration.test.ts
git commit -m "test(orchestrator): cover chunk session compaction and provider failover"
```

---

### Task 10: Update operator docs and verify

**Files:**
- Modify: `docs/RAMP_UP.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/PROGRESS.md`
- Modify: `docs/issues/INDEX.md` (only if any superseded issue should be marked or linked)

**Step 1: Update docs**

Document:

- chunk sessions are now canonical execution state
- compaction occurs at 85% context usage
- pre-compaction snapshots live under `.frankenbeast/.build/chunk-session-snapshots/`
- `--cleanup` removes chunk session artifacts too
- provider-native continuation is an optimization, not the source of truth

**Step 2: Run targeted verification**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/session tests/unit/skills tests/unit/adapters tests/unit/cli tests/e2e/cli-skill-execution.test.ts`
Expected: PASS

**Step 3: Run package test suite**

Run: `cd packages/franken-orchestrator && npm test`
Expected: PASS

**Step 4: Commit**

```bash
git add docs/RAMP_UP.md docs/ARCHITECTURE.md docs/PROGRESS.md docs/issues/INDEX.md
git commit -m "docs(orchestrator): document chunk session execution model"
```
