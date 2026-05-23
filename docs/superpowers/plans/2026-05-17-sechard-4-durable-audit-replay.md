# Chunk 4: Durable Audit & Replay — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist hash-addressed replay records for LLM/tool calls and persist the Beast phase state machine after every phase, so a run can be deterministically replayed and resumed from durable state rather than in-memory timeline analysis.

**Architecture:** Add a content-addressed blob store and versioned replay record types in `franken-observer`, persisted next to existing audit trails. Add a deterministic replay path that consumes saved records and verifies hashes. In `franken-orchestrator`, capture LLM/tool inputs/outputs through the audit observer adapter, and snapshot the `BeastContext` phase FSM after each phase to `.fbeast/state/<runId>.jsonl`. Structurally independent of Chunks 1–3; sequence last.

**Tech Stack:** TypeScript, Node `crypto` (sha256), Node `fs`, existing `AuditTrailStore`/`ExecutionReplayer`/`BeastContext`, Vitest.

---

## Verified Gap Evidence (current `main` @ `610a0ea`, 2026-05-17)

- `packages/franken-observer/src/execution-replayer.ts:42` — `replay(trail)` only groups existing `AuditEvent`s into an `ExecutionTimeline`; no re-execution from stored inputs, no hash verification.
- `packages/franken-observer/src/audit-trail-store.ts:23` — `save(runId, trail)` writes only `.fbeast/audit/<runId>.json`; no replay manifest/blobs.
- `packages/franken-observer/src/index.ts` — exports no replay record/store/verifier API.
- `packages/franken-orchestrator/src/beast-loop.ts:28` — `BeastLoop` runs ingestion→hydration→planning→execution→closure with `logger.info` only; no persisted transition.
- `packages/franken-orchestrator/src/context/franken-context.ts:29` — `BeastContext.phase` is an in-memory field; nothing persists it after each node.

## File Structure

- Create `packages/franken-observer/src/replay/replay-record.ts` — versioned record types + sha256 hashing.
- Create `packages/franken-observer/src/replay/replay-content-store.ts` — content-addressed blob store under `.fbeast/audit/blobs/`.
- Create `packages/franken-observer/src/replay/deterministic-replayer.ts` — replay saved records, verify hashes.
- Modify `packages/franken-observer/src/audit-trail-store.ts` — write a replay manifest alongside the trail.
- Modify `packages/franken-observer/src/index.ts` — export the new APIs.
- Modify `packages/franken-orchestrator/src/adapters/audit-observer-adapter.ts`, `src/adapters/cli-llm-adapter.ts`, `src/skills/cli-skill-executor.ts` — emit replay records.
- Create `packages/franken-orchestrator/src/context/state-snapshot-store.ts` — `.fbeast/state/<runId>.jsonl` appender.
- Modify `packages/franken-orchestrator/src/beast-loop.ts`, `src/context/franken-context.ts` — snapshot after each phase.
- Tests: `franken-observer/src/replay/replay-content-store.test.ts`, `…/deterministic-replayer.test.ts`; `franken-orchestrator/tests/unit/beast-loop-state-persistence.test.ts`, plus modified adapter/skill tests.

---

## Task 1: Content-addressed replay record store

**Files:**
- Create: `packages/franken-observer/src/replay/replay-record.ts`
- Create: `packages/franken-observer/src/replay/replay-content-store.ts`
- Test: `packages/franken-observer/src/replay/replay-content-store.test.ts`

- [x] **Step 1: Write the failing store test**

`replay-content-store.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ReplayContentStore } from './replay-content-store.js';
import { hashContent } from './replay-record.js';

describe('ReplayContentStore', () => {
  it('stores content by sha256 and reads it back', () => {
    const root = mkdtempSync(join(tmpdir(), 'replay-'));
    const store = new ReplayContentStore(root);
    const ref = store.put('hello world');
    expect(ref).toBe(hashContent('hello world'));
    expect(store.get(ref)).toBe('hello world');
  });

  it('detects tampering on read (hash mismatch throws)', () => {
    const root = mkdtempSync(join(tmpdir(), 'replay-'));
    const store = new ReplayContentStore(root);
    const ref = store.put('original');
    store.__corruptForTest(ref, 'tampered');
    expect(() => store.get(ref)).toThrow(/hash mismatch/i);
  });
});
```

- [x] **Step 2: Run, verify failure**

Run: `cd packages/franken-observer && npm test -- --run src/replay/replay-content-store.test.ts`
Expected: FAIL — modules do not exist.

- [x] **Step 3: Implement record types + store**

`replay-record.ts`:

```ts
import { createHash } from 'node:crypto';

export type ReplayRecordKind =
  | 'llm.request' | 'llm.response' | 'tool.call' | 'tool.result' | 'environment.snapshot';

export interface ReplayRecord {
  readonly version: 1;
  readonly kind: ReplayRecordKind;
  readonly runId: string;
  readonly timestamp: string;
  readonly provider?: string;
  readonly model?: string;
  readonly toolName?: string;
  readonly contentRef: string; // sha256 of the raw blob
}

export function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}
```

`replay-content-store.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { hashContent } from './replay-record.js';

export class ReplayContentStore {
  private readonly dir: string;
  constructor(baseDir: string) {
    this.dir = join(baseDir, 'blobs');
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
  }
  put(content: string): string {
    const ref = hashContent(content);
    const p = join(this.dir, ref);
    if (!existsSync(p)) writeFileSync(p, content, 'utf8');
    return ref;
  }
  get(ref: string): string {
    const content = readFileSync(join(this.dir, ref), 'utf8');
    if (hashContent(content) !== ref) throw new Error(`Replay blob hash mismatch for ${ref}`);
    return content;
  }
  /** test-only: simulate on-disk tampering */
  __corruptForTest(ref: string, replacement: string): void {
    writeFileSync(join(this.dir, ref), replacement, 'utf8');
  }
}
```

- [x] **Step 4: Run, verify pass**

Run: `cd packages/franken-observer && npm test -- --run src/replay/replay-content-store.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/franken-observer/src/replay/replay-record.ts packages/franken-observer/src/replay/replay-content-store.ts packages/franken-observer/src/replay/replay-content-store.test.ts
git commit -m "feat(observer): content-addressed replay record store"
```

---

## Task 2: Deterministic replayer + manifest persistence + exports

**Files:**
- Create: `packages/franken-observer/src/replay/deterministic-replayer.ts`
- Modify: `packages/franken-observer/src/audit-trail-store.ts`
- Modify: `packages/franken-observer/src/index.ts`
- Test: `packages/franken-observer/src/replay/deterministic-replayer.test.ts`

- [x] **Step 1: Write the failing replay test**

`deterministic-replayer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ReplayContentStore } from './replay-content-store.js';
import { DeterministicReplayer } from './deterministic-replayer.js';

it('replays a saved llm.response without calling a live provider', () => {
  const root = mkdtempSync(join(tmpdir(), 'replay-'));
  const store = new ReplayContentStore(root);
  const ref = store.put(JSON.stringify({ text: 'cached answer' }));
  const replayer = new DeterministicReplayer(store);
  const manifest = [{ version: 1, kind: 'llm.response', runId: 'r1', timestamp: 't', contentRef: ref }];
  const out = replayer.replayLlmResponse(manifest as never, 'r1', 0);
  expect(JSON.parse(out).text).toBe('cached answer');
});

it('throws if a referenced blob fails hash verification', () => {
  const root = mkdtempSync(join(tmpdir(), 'replay-'));
  const store = new ReplayContentStore(root);
  const ref = store.put('x');
  store.__corruptForTest(ref, 'y');
  const replayer = new DeterministicReplayer(store);
  expect(() => replayer.replayLlmResponse(
    [{ version: 1, kind: 'llm.response', runId: 'r1', timestamp: 't', contentRef: ref }] as never, 'r1', 0,
  )).toThrow(/hash mismatch/i);
});
```

- [x] **Step 2: Run, verify failure**

Run: `cd packages/franken-observer && npm test -- --run src/replay/deterministic-replayer.test.ts`
Expected: FAIL — module missing.

- [x] **Step 3: Implement the replayer + manifest + exports**

`deterministic-replayer.ts`:

```ts
import type { ReplayContentStore } from './replay-content-store.js';
import type { ReplayRecord } from './replay-record.js';

export class DeterministicReplayer {
  constructor(private readonly store: ReplayContentStore) {}
  replayLlmResponse(manifest: ReplayRecord[], runId: string, index: number): string {
    const responses = manifest.filter((r) => r.runId === runId && r.kind === 'llm.response');
    const rec = responses[index];
    if (!rec) throw new Error(`No saved llm.response at index ${index} for run ${runId}`);
    return this.store.get(rec.contentRef); // get() verifies hash
  }
  replayToolResult(manifest: ReplayRecord[], runId: string, index: number): string {
    const results = manifest.filter((r) => r.runId === runId && r.kind === 'tool.result');
    const rec = results[index];
    if (!rec) throw new Error(`No saved tool.result at index ${index} for run ${runId}`);
    return this.store.get(rec.contentRef);
  }
}
```

In `audit-trail-store.ts`, in `save(runId, trail)` after writing the trail JSON, also write the replay manifest if records were collected: add an optional `manifest?: ReplayRecord[]` parameter and write `join(this.auditDir, \`${runId}.replay.json\`)` with `JSON.stringify(manifest ?? [], null, 2)`. Keep the existing trail write unchanged (backward compatible).

In `index.ts`, add:

```ts
export { ReplayContentStore } from './replay/replay-content-store.js';
export { DeterministicReplayer } from './replay/deterministic-replayer.js';
export type { ReplayRecord, ReplayRecordKind } from './replay/replay-record.js';
export { hashContent } from './replay/replay-record.js';
```

- [x] **Step 4: Run, verify pass**

Run: `cd packages/franken-observer && npm test -- --run src/replay/deterministic-replayer.test.ts src/audit-trail-store.test.ts src/execution-replayer.test.ts`
Expected: PASS (existing replayer/trail tests stay green — additive change).

- [x] **Step 5: Commit**

```bash
git add packages/franken-observer/src/replay/deterministic-replayer.ts packages/franken-observer/src/audit-trail-store.ts packages/franken-observer/src/index.ts packages/franken-observer/src/replay/deterministic-replayer.test.ts
git commit -m "feat(observer): deterministic replay + replay manifest persistence"
```

---

## Task 3: Capture LLM/tool replay records in orchestrator

**Files:**
- Modify: `packages/franken-orchestrator/src/adapters/audit-observer-adapter.ts`
- Modify: `packages/franken-orchestrator/src/adapters/cli-llm-adapter.ts`
- Modify: `packages/franken-orchestrator/src/skills/cli-skill-executor.ts`
- Test: `packages/franken-orchestrator/tests/unit/adapters/cli-llm-adapter.test.ts`, `tests/unit/skills/cli-skill-executor.test.ts`

- [x] **Step 1: Write the failing capture test**

In `cli-llm-adapter.test.ts`:

```ts
it('records an llm.request and llm.response replay record per call', async () => {
  const records: { kind: string; contentRef: string }[] = [];
  const adapter = makeCliLlmAdapter({ /* existing fixture */ observer: { recordReplay: (r) => records.push(r) } as never });
  await adapter.complete({ prompt: 'hello', runId: 'r1' } as never);
  expect(records.map((r) => r.kind)).toEqual(['llm.request', 'llm.response']);
  expect(records[0].contentRef).toMatch(/^[a-f0-9]{64}$/);
});
```

Mirror the pattern in `cli-skill-executor.test.ts` for `tool.call` / `tool.result`.

- [x] **Step 2: Run, verify failure**

Run: `cd packages/franken-orchestrator && npm test -- --run tests/unit/adapters/cli-llm-adapter.test.ts tests/unit/skills/cli-skill-executor.test.ts`
Expected: FAIL — adapters do not record replay records.

- [x] **Step 3: Implement capture**

In `audit-observer-adapter.ts`, add a `recordReplay(record: ReplayRecord)` method that `put`s the raw content into a `ReplayContentStore` and appends the returned `ReplayRecord` to an in-run manifest array (flushed via `AuditTrailStore.save(runId, trail, manifest)` where the run already saves its trail). In `cli-llm-adapter.ts`, around the existing provider call, call `observer.recordReplay({ kind: 'llm.request', runId, provider, model, content: prompt })` before and `'llm.response'` after, hashing content via the store. In `cli-skill-executor.ts`, do the same for `tool.call` (args JSON) and `tool.result` (result JSON). Use the existing observer handle already threaded into these adapters — do not introduce a new global.

- [x] **Step 4: Run, verify pass**

Run: `cd packages/franken-orchestrator && npm test -- --run tests/unit/adapters/cli-llm-adapter.test.ts tests/unit/skills/cli-skill-executor.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/adapters/audit-observer-adapter.ts packages/franken-orchestrator/src/adapters/cli-llm-adapter.ts packages/franken-orchestrator/src/skills/cli-skill-executor.ts packages/franken-orchestrator/tests/unit/adapters/cli-llm-adapter.test.ts packages/franken-orchestrator/tests/unit/skills/cli-skill-executor.test.ts
git commit -m "feat(orchestrator): capture llm/tool replay records"
```

---

## Task 4: Persist Beast phase state machine

**Files:**
- Create: `packages/franken-orchestrator/src/context/state-snapshot-store.ts`
- Modify: `packages/franken-orchestrator/src/context/franken-context.ts`
- Modify: `packages/franken-orchestrator/src/beast-loop.ts`
- Test: `packages/franken-orchestrator/tests/unit/beast-loop-state-persistence.test.ts`

- [x] **Step 1: Write the failing state-persistence test**

`tests/unit/beast-loop-state-persistence.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

it('persists a phase snapshot after each phase', async () => {
  const stateDir = mkdtempSync(join(tmpdir(), 'state-'));
  const { loop, ctx } = makeBeastLoopWithFakePorts({ stateDir, runId: 'r1' }); // existing beast-loop test harness
  await loop.run(ctx);
  const lines = readFileSync(join(stateDir, 'r1.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const phases = lines.map((s) => s.phase);
  expect(phases).toEqual(expect.arrayContaining(['ingestion', 'hydration', 'planning', 'execution', 'closure']));
  expect(lines.at(-1)).toMatchObject({ runId: 'r1', phase: 'closure' });
});
```

- [x] **Step 2: Run, verify failure**

Run: `cd packages/franken-orchestrator && npm test -- --run tests/unit/beast-loop-state-persistence.test.ts tests/unit/beast-loop.test.ts`
Expected: FAIL — no state file written.

- [x] **Step 3: Implement snapshot store + wiring**

`state-snapshot-store.ts`:

```ts
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface PhaseSnapshot {
  readonly runId: string;
  readonly phase: string;
  readonly previousPhase: string | null;
  readonly timestamp: string;
  readonly planVersion?: number;
  readonly provider?: string;
  readonly lastAuditEventId?: string;
}

export class StateSnapshotStore {
  private readonly file: string;
  private previous: string | null = null;
  constructor(stateDir: string, runId: string) {
    if (!existsSync(stateDir)) mkdirSync(stateDir, { recursive: true });
    this.file = join(stateDir, `${runId}.jsonl`);
  }
  record(snapshot: Omit<PhaseSnapshot, 'previousPhase' | 'timestamp'>): void {
    const full: PhaseSnapshot = { ...snapshot, previousPhase: this.previous, timestamp: new Date().toISOString() };
    appendFileSync(this.file, JSON.stringify(full) + '\n');
    this.previous = snapshot.phase;
  }
}
```

Add an optional `stateStore?: StateSnapshotStore` to `BeastContext` (`franken-context.ts`). In `beast-loop.ts`, after each existing `logger.info('BeastLoop: phase end', { phase: X })` call (ingestion, hydration, planning, execution, closure), add `ctx.stateStore?.record({ runId: ctx.runId, phase: X, planVersion: ctx.planVersion, provider: ctx.provider });` using the values already on `ctx`. Construct the store where the loop is created (CLI/dep wiring), `stateDir = <fbeastRoot>/.fbeast/state`.

- [x] **Step 4: Run, verify pass**

Run: `cd packages/franken-orchestrator && npm test -- --run tests/unit/beast-loop-state-persistence.test.ts tests/unit/beast-loop.test.ts`
Expected: PASS (existing beast-loop tests unaffected — `stateStore` is optional).

- [x] **Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/context/state-snapshot-store.ts packages/franken-orchestrator/src/context/franken-context.ts packages/franken-orchestrator/src/beast-loop.ts packages/franken-orchestrator/tests/unit/beast-loop-state-persistence.test.ts
git commit -m "feat(orchestrator): persist beast phase state transitions"
```

---

## Task 5: Closeout — ADR + audit follow-up + verification

**Files:**
- Create: `docs/adr/037-durable-audit-and-deterministic-replay.md`
- Modify: `docs/audits/agent-systems-audit-2026-04-28.md`

- [x] **Step 1: Write ADR-037**

Record: replay records (LLM/tool) are content-addressed under `.fbeast/audit/blobs/` with sha256 verification; a manifest is persisted next to each audit trail; `DeterministicReplayer` replays saved LLM/tool outputs without a live provider; phase FSM snapshots are appended to `.fbeast/state/<runId>.jsonl` after each phase. Residual: full OS-level execution replay (process/syscall) is still out of scope; this is record/state replay only.

- [x] **Step 2: Audit follow-up**

Map Pillar-2 gaps: "Replay is timeline analysis, not deterministic execution replay" → `fixed` (record-level); "LLM prompts and responses are not universally persisted" → `partially-fixed` (captured at cli-llm/skill adapters; note any uncovered paths); "main Beast loop … not modeled as a persisted finite-state machine" → `fixed`. "Checkpointing is partial" → `partially-fixed` (state snapshots added; full prompt/response in replay store). Cite commits/tests.

- [x] **Step 3: Verify the chunk**

```bash
cd packages/franken-observer && npm test -- --run src/replay/replay-content-store.test.ts src/replay/deterministic-replayer.test.ts src/audit-trail-store.test.ts src/execution-replayer.test.ts && npm run typecheck
cd ../franken-orchestrator && npm test -- --run tests/unit/beast-loop-state-persistence.test.ts tests/unit/beast-loop.test.ts tests/unit/adapters/cli-llm-adapter.test.ts tests/unit/skills/cli-skill-executor.test.ts && npm run typecheck
```
Expected: all exit `0`.

- [x] **Step 4: Commit**

```bash
git add docs/adr/037-durable-audit-and-deterministic-replay.md docs/audits/agent-systems-audit-2026-04-28.md
git commit -m "docs: ADR-037 and audit follow-up for durable audit & replay"
```

---

## Self-Review

- **Spec coverage:** Pillar-2 gaps (timeline-only replay, in-memory FSM, non-universal LLM persistence, partial checkpointing) each map to a task; `partially-fixed` items are flagged honestly rather than overclaimed.
- **Placeholder scan:** Real code in store/replayer/snapshot steps; the orchestrator capture step names the exact adapters and the existing observer handle (no "add appropriate hooks").
- **Type consistency:** `ReplayRecord`/`ReplayRecordKind`/`hashContent`/`ReplayContentStore`/`DeterministicReplayer` named identically across observer modules, exports, tests, and orchestrator usage; `StateSnapshotStore.record` signature matches its `beast-loop.ts` call site; `PhaseSnapshot` fields match the test assertions (`runId`, `phase`).

## Execution Handoff

Plan complete. **(1) Subagent-Driven (recommended)** or **(2) Inline Execution** via executing-plans. Task 3 requires reading the existing observer handle threading in `cli-llm-adapter.ts`/`cli-skill-executor.ts` during implementation — flagged inline.
