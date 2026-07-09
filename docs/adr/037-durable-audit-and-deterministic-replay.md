# ADR-037: Durable Audit And Deterministic Replay

- **Date:** 2026-05-23
- **Status:** Accepted
- **Deciders:** pfk, per security-hardening Chunk 4

## Context

The 2026-04-28 agent-systems audit found that Frankenbeast's replay and state recovery were incomplete for deterministic agent operation:

- `ExecutionReplayer` reconstructed timelines from existing audit events, but it did not replay saved LLM or tool outputs from verified content.
- Audit persistence wrote `.fbeast/audit/<runId>.json` only; there was no replay manifest or content-addressed blob store for prompt/response/tool payloads.
- The Beast loop tracked phases in memory on `BeastContext.phase`, but phase transitions were not persisted after every node.
- CLI LLM and CLI skill execution paths recorded spans/token usage, but not durable replay payloads for requests, responses, tool calls, and tool results.

## Decision

Implement record/state replay primitives with explicit claim boundaries.

1. **Content-addressed replay records**
   - Add versioned replay record types for `llm.request`, `llm.response`, `tool.call`, `tool.result`, and `environment.snapshot`.
   - Store replay payload blobs by sha256 under `.fbeast/audit/blobs/<sha256>`.
   - Persist replay manifests next to audit trails as `.fbeast/audit/<runId>.replay.json`.
   - Manifest entries contain metadata plus `contentRef`; raw prompt/response/tool content stays in the blob store.

2. **Deterministic record replayer**
   - Add `DeterministicReplayer` for loading saved `llm.response` and `tool.result` payloads by run and ordinal.
   - Reads verify blob hashes before returning content.
   - This is deterministic record replay, not live provider/tool re-execution.

3. **Orchestrator replay capture**
   - `CliLlmAdapter` emits `llm.request` and `llm.response` replay capture records.
   - `CliSkillExecutor` emits `tool.call` and `tool.result` replay capture records.
   - `AuditTrailObserverAdapter` and `CliObserverBridge` hash replay content through a `ReplayContentStore` and expose content-ref manifests.
   - CLI dependency wiring persists bridge-captured replay records during finalization and merges them with any consolidated observer replay manifest for the same run artifact.

4. **Durable phase state snapshots**
   - Add `StateSnapshotStore` for appending `.fbeast/state/<runId>.jsonl` phase snapshots.
   - `BeastLoop` records snapshots after ingestion, hydration, planning, execution, and closure when `config.stateDir` is configured.
   - Snapshots include run id, phase, previous phase, timestamp, and available execution metadata.

## Consequences

### Positive

- Audit artifacts now have replay manifests and content-addressed LLM/tool payloads, not only high-level audit events.
- Replay content integrity is verified through sha256 before use.
- CLI LLM and CLI skill execution paths persist prompt/response/tool call/tool result records through observer-compatible adapters.
- Beast phase transitions are append-only durable state, so resumption/debugging no longer depends only on in-memory phase state or coarse checkpoint markers.
- Replay manifests avoid embedding raw prompt/response/tool payloads directly in JSON manifests.

### Negative / Residual

- This is record-level deterministic replay. It does not replay OS process state, syscalls, filesystem mutations, network calls, or live tool side effects.
- LLM/tool capture is wired through the CLI LLM adapter and CLI skill executor paths covered by this chunk. Any future execution path that bypasses those adapters must add its own replay capture.
- Content-addressed blobs preserve raw LLM/tool payloads on disk; retention, encryption, and redaction policies remain future hardening work.
- Phase snapshots improve state-machine durability, but they do not replace task checkpoints or provide full process checkpoint/restore.

## Verification

```bash
cd packages/franken-observer
npm test -- --run src/replay/replay-content-store.test.ts src/replay/deterministic-replayer.test.ts src/audit-trail-store.test.ts src/execution-replayer.test.ts
npm run typecheck

cd ../@franken/orchestrator
npm test -- --run tests/unit/beast-loop-state-persistence.test.ts tests/unit/beast-loop.test.ts tests/unit/adapters/audit-observer-adapter.test.ts tests/unit/adapters/cli-observer-bridge.test.ts tests/unit/cli/create-beast-deps.test.ts tests/unit/adapters/cli-llm-adapter.test.ts tests/unit/skills/cli-skill-executor.test.ts
npm run typecheck
```

Targeted result during implementation: observer verification passed with 4 test files / 19 tests; orchestrator verification passed with 7 test files / 123 tests; both package typechecks passed.
