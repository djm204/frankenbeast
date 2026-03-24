# Phase 4.5 Residual Issues

Minor items identified during Phase 4.5 (Comms Integration) review that don't block the phase but should be tracked.

---

## M1. ChatRuntimeResult has no providerContext or phase field

**Status:** Open (intentional)
**Severity:** Medium
**Context:** The Chunk 4.5.02 spec says the adapter reads `result.providerContext` and `result.phase` from ChatRuntimeResult. These fields don't exist on `ChatRuntimeResult` yet. `ChatRuntimeCommsAdapter` has the mapping code (using `as unknown as Record<string, unknown>`) but it will return `undefined` until Phase 8 wires ProviderRegistry into ChatRuntime and adds those fields to the result type.

**Why kept:** ChatRuntime is modified in Phase 8 (dep-factory rewiring). The adapter mapping code is ready; only the source data is missing.

**Fix:** Phase 8 — add `providerContext` and `phase` fields to `ChatRuntimeResult`, remove the `as unknown` cast in the adapter.

**Affected files:**
- `packages/franken-orchestrator/src/chat/runtime.ts` (ChatRuntimeResult type)
- `packages/franken-orchestrator/src/comms/core/chat-runtime-comms-adapter.ts` (remove cast)

---

## M2. CommsRunConfigSchema not integrated into run-config v2 or CLI flags

**Status:** Open (intentional)
**Severity:** Medium
**Context:** Chunk 4.5.04 defines `CommsRunConfigSchema` as a standalone Zod schema with tests. The spec also calls for integrating it into the top-level run-config v2 schema and adding CLI flags (`--comms`, `--slack`, etc.). Neither exists — Phase 8 chunk 07 owns the run-config v2 schema.

**Fix:** Phase 8 — add `comms: CommsRunConfigSchema.default({})` to `RunConfigV2Schema`, add CLI flag parsing.

**Affected files:**
- Phase 8 run-config v2 schema
- CLI flag parser

---

## I1. Phase field not rendered by channel adapters

**Status:** Open
**Severity:** Informational
**Context:** The `phase` field flows through `ChatGateway` to `ChannelOutboundMessage.phase` but no adapter reads or renders it. The spec shows phase as part of the outbound metadata, but the per-adapter formatting only handles `provider` (not `phase`).

**Fix (optional):** Add phase rendering to each adapter's formatting logic. Low priority — provider metadata is the primary visibility feature; phase is supplementary.

---

## I2. Webhook HTTP path integration test not implemented

**Status:** Open
**Severity:** Informational
**Context:** The Chunk 4.5.05 spec includes a "webhook → gateway → runtime" test that constructs the full Hono HTTP stack and sends a real Slack webhook POST. The integration test covers the gateway-level round-trip (mock runtime, verify routing) but not the HTTP layer. The comms-routes.test.ts covers the HTTP path separately.

**Fix (optional):** Add a combined test using `createCommsApp` with `securityProfile: 'permissive'` that sends a real Slack event_callback POST. Low priority — the HTTP path and gateway path are both tested, just not in one test.

---

## Summary

| ID | Severity | Blocks Phase 4.5? | Resolution |
|----|----------|-------------------|------------|
| M1 | Medium | No | Phase 8 |
| M2 | Medium | No | Phase 8 |
| I1 | Info | No | Optional |
| I2 | Info | No | Optional |

**Verdict:** Phase 4.5 is complete. All medium items are tracked for Phase 8. No blockers.
