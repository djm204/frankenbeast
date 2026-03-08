# ADR-001: TypeScript Strict Mode with NodeNext Resolution

- **Date:** 2026-02-19
- **Status:** Accepted
- **Deciders:** franken-critique team

## Context

MOD-06 (Self-Critique & Reflection) is a Node.js module that evaluates agent output against guardrails and architectural rules. It interfaces with MOD-01 (Guardrails/Firewall), MOD-03 (Memory/Brain), and MOD-04 (Planner). The module handles complex domain types: evaluation results, critique feedback, circuit breaker state, and correction requests.

All sibling Frankenbeast modules (franken-governor, franken-brain, franken-skills, frankenfirewall) use TypeScript strict mode. Consistency across the monorepo is essential for cross-module type safety.

## Decision

Use **TypeScript (strict mode)** targeting Node.js 22+, compiled with `tsc`.

- `tsconfig.json`: `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`
- ESM modules (`"type": "module"` in `package.json`)
- `module: "NodeNext"`, `moduleResolution: "NodeNext"` (Pattern A, consistent with franken-governor, franken-brain, franken-skills)
- Vitest as the test runner
- Package name: `@franken/critique`

## Consequences

### Positive
- Type-safe interfaces for evaluation results, critique feedback, and correction requests
- Compile-time safety prevents silent mismatches when integrating with MOD-01 and MOD-03
- Consistent with all sibling modules; enables shared type packages in the future
- IDE support for complex nested types (e.g., `EvaluationResult<FactualityCheck>`)

### Negative
- Build step required before running (mitigated by `tsx` for development)
- Strict mode catches more errors upfront, slightly slower initial development

### Risks
- None significant; this is a well-proven pattern across the Frankenbeast ecosystem

## Alternatives Considered

| Option | Pros | Cons | Rejected Because |
|--------|------|------|-----------------|
| Pattern B (ESNext/bundler with tsup) | Bundled output, tree-shaking | Inconsistent with most sibling modules | Pattern A is dominant across the ecosystem |
| Plain JavaScript | No build step | No type safety on evaluation schemas | Evaluation criteria and feedback types are complex enough to warrant compile-time checks |
