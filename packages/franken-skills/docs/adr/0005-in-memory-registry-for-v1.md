# ADR-0005 — In-Memory Registry for v1 (No External Store)

**Status**: Accepted

## Context

The registry needs a backing store for the resolved skill inventory. Options range from an in-process Map to a Redis cache to a SQLite file to a remote database.

The registry is populated at startup via `sync()` and is read-only during the agent's run. Skills don't change mid-session. The performance requirement is sub-millisecond `getSkill()` lookups.

## Decision

Use an in-memory `Map<string, UnifiedSkillContract>` as the backing store for v1. The registry is populated once during startup sync and remains immutable until the next `sync()` call.

Rationale:
- **Simplicity**: No external service dependency. MOD-02 deploys as a self-contained module.
- **Performance**: Map lookup is O(1). No network round-trip per skill resolution — MOD-01 calls `hasSkill()` on every tool call.
- **Correctness**: The registry is read-only after sync. Immutability eliminates concurrent-write concerns.
- **Sufficient for v1**: Skills are defined at deploy time, not runtime. There is no use case for dynamic skill registration in v1.

The concrete `SkillRegistry` class exposes an `isSynced()` flag. Any call to `getSkill()` or `getAll()` before `sync()` completes throws a `SkillRegistryError` with code `REGISTRY_NOT_SYNCED`. Callers must await sync before queries.

## Consequences

- Registry state is lost on process restart — `sync()` must be called at every startup. This is acceptable: the source of truth is always `@djm204/agent-skills` and `/skills`, not the in-memory store.
- No persistence means no cross-process sharing. If multiple agent processes share a registry, each maintains its own in-memory copy. Acceptable for v1; an external store (Redis, SQLite) can be introduced behind the `ISkillRegistry` interface in a future version without breaking callers.
- Memory footprint is proportional to skill count. At expected scale (tens to low hundreds of skills), this is negligible.
- External store deferred: when v2 introduces one, it will be behind the existing `ISkillRegistry` interface — no MOD-01 changes required.
