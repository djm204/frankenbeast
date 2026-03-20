# Phase 7: Reframe Observer as Audit Trail

**Goal:** Observer produces deterministic, replayable execution logs suitable for compliance auditing. Every execution decision is recorded with input/output hashes for verification.

**Dependencies:** Phase 3 (needs provider switch events from ProviderRegistry)

**Why this matters:** This is one of Frankenbeast's differentiators — self-contained, replayable execution logs that live with the project. External tools like LangSmith provide better polish but require SaaS subscriptions. Frankenbeast's audit trail is portable and self-verifying.

---

## Design

### Audit Event

Every observer event gets an extended audit record:

```typescript
interface AuditEvent {
  eventId: string;           // UUID
  timestamp: string;         // ISO 8601
  phase: string;             // which Beast Loop phase
  provider: string;          // which LLM provider
  type: string;              // event type (e.g., 'llm.request', 'llm.response', 'provider.switch')
  inputHash?: string;        // SHA-256 of the input (for verification)
  outputHash?: string;       // SHA-256 of the output
  payload: unknown;          // event-specific data
  parentEventId?: string;    // for nested events (e.g., tool calls within an LLM response)
}
```

Events are append-only and immutable. The full sequence can be replayed to reproduce the decision path.

### Provider Switch Events

When the ProviderRegistry switches providers, the observer records:
```typescript
{
  type: 'provider.switch',
  payload: {
    from: 'claude-cli',
    to: 'codex-cli',
    reason: 'rate-limit',
    brainSnapshotHash: 'sha256:abc123...',
  }
}
```

### Audit Artifact Persistence

The ADR promise is stronger than an in-memory event list: the resulting audit trail must live with the project and be replayable later.

For v1, each run should emit a self-contained audit artifact under `.frankenbeast/audit/` containing:
- run metadata
- the ordered audit event list
- enough schema/version info to replay the run offline

Replay can still operate on `AuditTrail` in memory, but persistence must be specified as a first-class step in the plan.

## Chunks

| # | Chunk | Committable Unit |
|---|-------|-----------------|
| 01 | [Audit event schema](phase7-observer-audit/01_audit-event-schema.md) | Extended event types + hashing |
| 02 | [Execution replay](phase7-observer-audit/02_execution-replay.md) | `ExecutionReplayer` class |
| 03 | [Provider switch audit](phase7-observer-audit/03_provider-switch-audit.md) | Observer integration with ProviderRegistry |
| 04 | [Audit trail persistence](phase7-observer-audit/04_audit-trail-persistence.md) | Persist replayable audit artifacts to project storage |

**Execution:** Sequential — 01 defines the schema, 02 builds on it, 03 integrates with Phase 3, 04 persists the finished artifact.
