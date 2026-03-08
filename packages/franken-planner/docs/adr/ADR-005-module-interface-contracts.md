# ADR-005: Typed Interfaces for All Module Boundaries (Dependency Injection)

**Date:** 2026-02-19
**Status:** Accepted
**Deciders:** franken-planner team

---

## Context

MOD-04 communicates with four other Frankenbeast modules at runtime:

| Module                 | Direction | Purpose                                                 |
| ---------------------- | --------- | ------------------------------------------------------- |
| MOD-01 (Guardrails)    | Inbound   | Provides the sanitized `Intent` object                  |
| MOD-02 (agent-skills)  | Query     | Discover available tools/skills                         |
| MOD-03 (Memory)        | Query     | Retrieve ADRs, known errors, project context            |
| MOD-07 (Self-Critique) | Outbound  | Receive `RationaleBlock` for pre-execution verification |

In a development/test environment, the concrete modules do not exist yet. MOD-04 must be buildable and fully testable in isolation.

## Decision

Define a TypeScript `interface` for each module boundary in `src/modules/`. Inject dependencies via constructor. In production, concrete adapters implement the interfaces. In tests, simple in-memory fakes are used.

```typescript
// src/modules/mod01.ts
export interface GuardrailsModule {
  getSanitizedIntent(rawInput: string): Promise<Intent>;
}

// src/modules/mod03.ts
export interface MemoryModule {
  getADRs(): Promise<ADR[]>;
  getKnownErrors(): Promise<KnownError[]>;
  getProjectContext(): Promise<ProjectContext>;
}

// src/modules/mod07.ts
export interface SelfCritiqueModule {
  verifyRationale(rationale: RationaleBlock): Promise<VerificationResult>;
}
```

The `Planner` class receives these as constructor arguments. No module is imported directly.

## Alternatives Considered

| Option                             | Reason Rejected                                                   |
| ---------------------------------- | ----------------------------------------------------------------- |
| Direct imports of concrete modules | Creates hard coupling; MOD-04 can't be built/tested independently |
| Service locator / global registry  | Implicit dependencies; harder to test and reason about            |
| Event bus only                     | Asynchronous fire-and-forget loses type safety on return values   |

## Consequences

- **Positive:** MOD-04 is fully independently buildable and testable.
- **Positive:** Swapping concrete implementations (e.g., different memory backends) requires no changes to Planner.
- **Positive:** Tests use simple object literals as fakes — no complex mocking frameworks needed.
- **Negative:** Must maintain interface alignment with sibling modules as they evolve — mitigated by shared type package (future work).
