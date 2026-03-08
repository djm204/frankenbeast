# ADR-0006 — Skill Registry as External Dependency (Interface, Not Import)

**Status**: Accepted

## Context

The DeterministicGrounder must validate tool call `function_name` values against MOD-02's Skill Registry. However, MOD-01 must not import MOD-02 directly — this would create a hard coupling between two independently deployable modules.

## Decision

MOD-01 defines a minimal `SkillRegistryClient` interface with a single method: `hasSkill(name: string): boolean`. The concrete implementation (an HTTP client, in-process registry, or mock) is injected at runtime by the caller (the Orchestrator or test harness).

The `DeterministicGrounder` accepts a `SkillRegistryClient` as a parameter. If no client is provided, grounding is skipped (treated as pass) and a warning is logged — this is acceptable for environments where MOD-02 is not yet deployed.

## Consequences

- MOD-01 has zero compile-time dependency on MOD-02's codebase
- The Orchestrator is responsible for constructing and injecting the registry client
- Tests use a stub implementation — no network calls in unit tests
- If `SkillRegistryClient` is not provided, ungrounded tool calls will execute; this must be flagged in observability
