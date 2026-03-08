# ADR-0002 — UnifiedSkillContract v1 Canonical Schema

**Status**: Accepted

## Context

MOD-01's DeterministicGrounder must validate every LLM tool call against the registry before execution. It needs to know: (1) does this skill exist, (2) are the arguments schema-valid, (3) is the skill destructive or does it require HITL. These constraints must be declared by MOD-02 — MOD-01 enforces them but cannot invent them.

The contract must be stable. MOD-01, the Planner (MOD-04), and any future orchestrator all depend on it. Breaking changes cannot be silent.

## Decision

Version 1 of the `UnifiedSkillContract` has the following required fields — all are mandatory, no optional paths:

```
skill_id:         string         — globally unique identifier
metadata.name:    string         — human-readable name
metadata.description: string    — high-clarity purpose statement for LLM routing
metadata.source:  GLOBAL | LOCAL — origin of the skill
interface.input_schema:  JSONSchema  — validates tool call arguments before execution
interface.output_schema: JSONSchema  — expected shape of the skill's return value
constraints.is_destructive:  boolean — if true, MOD-01 requires explicit Planner acknowledgment
constraints.requires_hitl:   boolean — if true, pipeline pauses for human confirmation
constraints.sandbox_type: DOCKER | WASM | LOCAL — declares required execution environment
```

Validation is strict: any missing or wrongly-typed field rejects the entire contract. Partial contracts are not coerced into valid ones.

The schema is versioned. Breaking changes (new required fields, type changes, field removals) require a new ADR and a migration path. A quiet field rename is a breaking change.

## Consequences

- Every skill source (global npm package, local `/skills`) must produce a contract that passes `validateSkillContract()` before registration
- MOD-01's `ISkillRegistry` interface can depend on `getSkill()` returning `UnifiedSkillContract | undefined` — the shape is guaranteed or the skill was never registered
- `is_destructive` and `requires_hitl` are correctness signals, not documentation. Misdeclaring them is a security defect
- `input_schema` enables MOD-01 to validate tool call arguments without knowing anything about the skill's implementation
- Adding new optional fields in a future version is backwards-compatible and does not require a new ADR
