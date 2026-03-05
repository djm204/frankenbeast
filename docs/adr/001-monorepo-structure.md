# ADR-001: Monorepo with Independent Modules

## Status
Accepted

## Context
Frankenbeast comprises 8 modules that need to work together but should be independently testable and deployable.

## Decision
Use a flat monorepo with `file:` protocol dependencies between packages. Each module is a standalone npm package with its own `package.json`, `tsconfig.json`, and `vitest.config.ts`.

## Consequences
- Each module can be tested in isolation
- No build tool overhead (Turborepo, Nx, etc.)
- `file:` deps provide type safety without a build step
- Requires manual coordination for version bumps
