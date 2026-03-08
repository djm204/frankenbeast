# ADR-001: TypeScript Strict Mode with NodeNext Resolution

## Status

Accepted

## Context

MOD-07 must be independently buildable and testable as a Node.js library. Sibling modules use two patterns:
- **Pattern A** (franken-brain, franken-skills): `module: "NodeNext"`, `moduleResolution: "NodeNext"`, built with `tsc`.
- **Pattern B** (franken-observer, franken-planner): `module: "ESNext"`, `moduleResolution: "bundler"`, built with `tsup`.

MOD-07 is a library with no bundling needs — it exports TypeScript types and classes consumed by other modules.

## Decision

Use Pattern A: `module: "NodeNext"`, `moduleResolution: "NodeNext"`, built with `tsc`. Strict mode is enabled with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.

Package name: `@franken/governor`, following the `@franken/*` scope convention.

## Consequences

- **Positive:** Matches the simpler library pattern (franken-brain, franken-skills). No bundler configuration needed.
- **Positive:** `.js` extensions in imports are enforced, preventing runtime resolution issues.
- **Positive:** Strict mode catches type errors at compile time.
- **Negative:** No dual CJS+ESM output — ESM only. Acceptable since all consumers are ESM.
