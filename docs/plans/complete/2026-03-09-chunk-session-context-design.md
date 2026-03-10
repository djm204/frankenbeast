# Chunk Session Context Preservation Design

**Date:** 2026-03-09
**Status:** Approved
**Scope:** `packages/franken-orchestrator`

## Goal

Replace the current one-shot chunk execution model with durable, provider-agnostic chunk sessions so execution can preserve context across iterations, survive provider failure, compact safely when context usage reaches 85%+, and clean up session artifacts predictably.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Canonical chunk state | Frankenbeast-owned `ChunkSession` | Provider-native session state is not reliable enough for failover or recovery. |
| Provider continuation | Optimization only | Providers like Claude can use `--continue`, but the canonical session file remains the source of truth. |
| Compaction trigger | Observer-triggered at `>= 85%` window usage | Makes context pressure explicit and deterministic instead of relying on provider failure. |
| Compaction safety | Pre-compaction checkpoint required | Bad compaction must be recoverable without losing the chunk transcript. |
| Session storage | `.frankenbeast/.build/chunk-sessions/` | Chunk sessions are execution artifacts, not product data. |
| Session retention | GC plus `--cleanup` | Successful and stale sessions should not accumulate forever. |

## Problem

Today the chunk execution path is effectively one-shot:

- `CliSkillExecutor` builds a `MartinLoopConfig` from the task objective.
- `MartinLoop` repeatedly spawns providers with prompts, but it does not own a durable transcript for chunk work.
- provider-native continuation is only wired for chat-like `CliLlmAdapter` calls, not for chunk execution.
- `FileCheckpointStore` tracks task completion and recovery commits, but not execution context state.

That means long-running chunks pay replay cost poorly, provider switches lose history, and there is no safe compaction path before context-window exhaustion.

## Architecture

### 1. Canonical `ChunkSession`

Add a first-class `ChunkSession` model stored on disk per chunk. It is the canonical representation of execution state, independent of any provider.

Suggested fields:

```ts
interface ChunkSession {
  version: 1;
  sessionId: string;
  planName: string;
  taskId: string;
  chunkId: string;
  promiseTag: string;
  workingDir: string;
  status: 'active' | 'completed' | 'failed' | 'abandoned';
  iterations: number;
  compactionGeneration: number;
  activeProvider?: string;
  lastKnownGoodCommit?: string;
  contextWindow: {
    provider: string;
    usedTokens: number;
    maxTokens: number;
    usageRatio: number;
    compactThreshold: number;
    lastCompactedAtIteration?: number;
  };
  transcript: ChunkTranscriptEntry[];
  compactions: ChunkCompactionRecord[];
  createdAt: string;
  updatedAt: string;
}
```

`transcript` entries should be normalized rather than provider-specific. At minimum:

- `system` for execution policy and stop condition
- `objective` for the task request
- `assistant` for model output
- `tool_summary` for summarized tool/file actions
- `compaction_summary` for retained context after compaction
- `checkpoint` for pre-compaction snapshot markers
- `error` for provider or recovery failures

### 2. Session Store and Snapshot Store

Add two storage abstractions:

- `ChunkSessionStore`: CRUD for active chunk sessions
- `ChunkSessionSnapshotStore`: immutable pre-compaction snapshots used for rollback

File layout:

```text
.frankenbeast/.build/
  chunk-sessions/
    <plan-name>/
      <chunk-id>.json
  chunk-session-snapshots/
    <plan-name>/
      <chunk-id>/
        <timestamp>-gen-<n>.json
```

This is deliberately separate from the existing line-based `.checkpoint` file because the data is structured and needs rollback semantics.

### 3. Session Renderer

Introduce a `ChunkSessionRenderer` that converts canonical chunk state into a provider request.

Responsibilities:

- render normalized transcript into the provider’s expected prompt shape
- include the latest compaction summary instead of replaying fully compacted history
- inject promise tag, objective, current repo state summary, and next-step instruction
- expose a provider-specific hook so providers with native continuation can opt into it

Provider-native continuation becomes an optimization:

- if the provider supports native resume and the active provider did not change, the renderer may pass `--continue`
- if the provider changed or native state is unavailable, replay from canonical session state

### 4. Observer-Owned Context Budget

Extend the observer bridge so it can estimate context usage per chunk session, not just token spend and USD cost.

New observer responsibilities:

- estimate current prompt footprint for the rendered session
- know the provider’s effective context window
- return a structured decision: continue vs compact

Suggested shape:

```ts
interface ContextWindowUsage {
  usedTokens: number;
  maxTokens: number;
  usageRatio: number;
  threshold: number;
  shouldCompact: boolean;
}
```

For v1, token estimation can be heuristic and provider-defined. Exact tokenizer fidelity is less important than deterministic triggering and safety margin.

### 5. Safe Compaction Pipeline

Before compaction:

1. Persist the live `ChunkSession`
2. Write a snapshot to `ChunkSessionSnapshotStore`
3. Record a checkpoint entry in the session transcript

Then compact:

1. Render a compaction prompt from recent transcript and current execution state
2. Ask the provider to summarize:
   - completed work
   - files touched / important diffs
   - unresolved errors
   - remaining objective
   - the exact promise tag and stopping contract
3. Replace older transcript slices with a `compaction_summary`
4. Increment `compactionGeneration`
5. Recompute context usage and validate the compacted session

If compaction or first post-compaction iteration fails validation, restore the most recent snapshot and mark the failure in the session.

### 6. `MartinLoop` as Session Runner

Refactor `MartinLoop` so each iteration works against a `ChunkSession`, not just a raw prompt string.

New loop shape:

1. Load or create `ChunkSession`
2. Render provider request
3. Spawn provider
4. Normalize output/events back into session transcript
5. Update observer token/cost accounting
6. Ask observer for context-window usage
7. Snapshot + compact if threshold is reached
8. Continue until promise tag detected, timeout, max iterations, or fatal failure

This keeps provider failure and provider switching orthogonal to context preservation.

### 7. Garbage Collection and Cleanup

Chunk sessions are build artifacts and need lifecycle management.

Add `ChunkSessionGc` with two modes:

- opportunistic GC during CLI startup/finalize:
  - delete completed sessions older than a short retention window
  - delete abandoned/failed sessions older than a longer retention window
  - delete orphaned snapshots whose parent session no longer exists
- explicit cleanup:
  - `--cleanup` removes chunk sessions, chunk snapshots, logs, traces, and existing `.checkpoint` files

Because `cleanupBuild()` currently only unlinks direct child files, it must become recursive directory cleanup so nested chunk-session directories are removed too.

## File and Component Changes

### New

- `src/session/chunk-session.ts`
- `src/session/chunk-session-store.ts`
- `src/session/chunk-session-snapshot-store.ts`
- `src/session/chunk-session-renderer.ts`
- `src/session/chunk-session-compactor.ts`
- `src/session/chunk-session-gc.ts`

### Modified

- `src/skills/cli-types.ts`
- `src/skills/providers/cli-provider.ts`
- provider implementations under `src/skills/providers/`
- `src/skills/martin-loop.ts`
- `src/skills/cli-skill-executor.ts`
- `src/adapters/cli-observer-bridge.ts`
- `src/checkpoint/file-checkpoint-store.ts`
- `src/cli/dep-factory.ts`
- `src/cli/cleanup.ts`
- `src/cli/run.ts`
- `src/cli/project-root.ts`

## Failure Handling

- Provider crash: record an `error` transcript entry, preserve session, switch providers if allowed, replay from canonical state.
- Compaction failure: restore the last snapshot and fail the iteration explicitly rather than continuing with corrupted context.
- Post-compaction drift: if the first resumed turn loses the promise tag or execution contract, restore the snapshot and retry once with stronger compaction instructions.
- Dirty file recovery: continue using `FileCheckpointStore` for commit recovery, but also update `ChunkSession.lastKnownGoodCommit`.

## Non-Goals

- Full cross-provider transcript semantics parity beyond prompt-based replay
- Long-term retention of chunk sessions outside `.frankenbeast/.build`
- Exact tokenizer implementations for every provider in v1
- New end-user CLI flags for tuning compaction threshold in v1

## Testing Strategy

1. Unit tests for `ChunkSessionStore`, snapshot rollback, renderer, and GC
2. Unit tests for provider capability flags and native continuation wiring
3. Unit tests for observer context-usage estimation and 85% compaction triggering
4. Unit tests for `MartinLoop` session replay, compaction, and provider failover
5. Integration tests for `CliSkillExecutor` plus checkpoints and compaction snapshots
6. CLI tests for recursive `--cleanup`
7. E2E test covering a chunk that compacts mid-run, resumes, and completes

## Open Constraints Chosen for V1

- `85%` compaction threshold is fixed in code
- native provider continuation is only used when the provider instance stays the same
- chunk sessions are scoped by plan name and chunk id
- cleanup removes all chunk-session artifacts, not just stale ones
