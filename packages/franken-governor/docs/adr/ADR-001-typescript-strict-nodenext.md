# ADR-001: TypeScript Strict Mode with NodeNext Resolution

## Status

Accepted

## Context

MOD-07 must be independently buildable and testable as a Node.js library. Current sibling libraries including `@franken/brain`, `@franken/types`, `@franken/observer`, and `@franken/planner` use `module: "NodeNext"` with `moduleResolution: "NodeNext"`.

MOD-07 is a library with no bundling needs — it exports TypeScript types and classes consumed by other modules.

## Decision

Use Pattern A: `module: "NodeNext"`, `moduleResolution: "NodeNext"`, built with `tsc`. Strict mode is enabled with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.

Package name: `@franken/governor`, following the `@franken/*` scope convention.

## Consequences

- **Positive:** Matches the simpler library pattern used by `@franken/brain` and `@franken/types`. No bundler configuration needed.
- **Positive:** `.js` extensions in imports are enforced, preventing runtime resolution issues.
- **Positive:** Strict mode catches type errors at compile time.
- **Negative:** No dual CJS+ESM output — ESM only. Acceptable since all consumers are ESM.
