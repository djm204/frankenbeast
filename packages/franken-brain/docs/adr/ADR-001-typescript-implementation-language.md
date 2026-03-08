# ADR-001: TypeScript as the Implementation Language

- **Date:** 2026-02-19
- **Status:** Accepted
- **Deciders:** franken-brain team

## Context

MOD-03 (Memory Systems) is a Node.js backend module that will interface with vector databases, SQLite, and LLM APIs. We need a language that provides strong type safety for complex data structures (memory entries, metadata schemas, compression results) while remaining compatible with the `@djm204/agent-skills` ecosystem.

The module handles:
- Memory entries with strict metadata schemas (`project_id`, `status`, `timestamp`)
- Async I/O to multiple persistence backends (SQLite, vector store)
- LLM API calls (model-agnostic: Claude, GPT)
- Complex domain types (WorkingMemory, EpisodicTrace, SemanticChunk)

## Decision

Use **TypeScript (strict mode)** as the sole implementation language, targeting Node.js 22+.

- `tsconfig.json` with `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`
- ESM modules (`"type": "module"` in `package.json`)
- Vitest as the test runner (native ESM, fast, compatible with TypeScript)

## Consequences

### Positive
- Compile-time safety on memory schemas prevents silent data corruption
- IDE autocomplete on complex nested types (e.g., `MemoryEntry<EpisodicTrace>`)
- Aligns with existing `.cursor/rules/javascript-expert-typescript-deep-dive.mdc` guidance
- Type-safe interfaces between modules (MOD-01 PII scanner, MOD-04 Planner)

### Negative
- Build step required before running (mitigated by `tsx` for development)
- Type definitions needed for third-party libraries without native TS support

### Risks
- Over-engineering types can slow early TDD cycles — keep interfaces minimal and evolve them

## Alternatives Considered

| Option | Pros | Cons | Rejected Because |
|--------|------|------|-----------------|
| Plain JavaScript | No build step, faster iteration | No type safety on memory schemas, harder to refactor | Memory entry schemas are complex enough that runtime type errors would be costly |
| Python | Better ML/vector library ecosystem | Incompatible with `@djm204/agent-skills` JS ecosystem | Ecosystem mismatch |
