# ADR-0006 — ISkillRegistry as the Public API Boundary

**Status**: Accepted

## Context

MOD-01's `DeterministicGrounder` must resolve tool call names against MOD-02's registry. MOD-01 already defines a minimal `SkillRegistryClient` interface (from its own ADR-0006) with `hasSkill(name: string): boolean`. MOD-02 must be the concrete implementation that satisfies this contract.

The question is: what does MOD-02 export as its public API? Options:
- Export the concrete `SkillRegistry` class directly
- Export a minimal `ISkillRegistry` interface and hide the implementation
- Export both and let callers decide

## Decision

MOD-02's `src/index.ts` exports:
1. `ISkillRegistry` — the interface MOD-01 and the Orchestrator (MOD-04) depend on
2. `createRegistry(config)` — a factory function that returns a synced `ISkillRegistry` instance
3. `UnifiedSkillContract` — the type that flows through the system
4. `SkillRegistryError` — the structured error shape

The concrete `SkillRegistry` class is **not** exported. Callers receive an `ISkillRegistry`. This enforces the interface contract: nothing downstream can call methods that aren't on the interface.

`ISkillRegistry` methods:
```
hasSkill(id: string): boolean
getSkill(id: string): UnifiedSkillContract | undefined
getAll(): UnifiedSkillContract[]
sync(): Promise<void>
isSynced(): boolean
```

This satisfies MOD-01's `SkillRegistryClient` interface (`hasSkill`) and extends it with retrieval and sync methods needed by MOD-04.

## Consequences

- MOD-01 has zero compile-time dependency on `SkillRegistry` the class — it depends on `ISkillRegistry` the interface
- The Orchestrator (MOD-04) calls `createRegistry(config)` once, awaits `sync()`, then injects the instance into MOD-01's pipeline
- Unit tests stub `ISkillRegistry` — no real registry needed to test MOD-01 or MOD-04
- The internal `SkillRegistry` implementation can be replaced (e.g., with a Redis-backed version) without touching any consumer code — just swap the factory
- `createRegistry()` is the only place `new SkillRegistry()` is called. Dependency inversion is enforced structurally, not by convention.
