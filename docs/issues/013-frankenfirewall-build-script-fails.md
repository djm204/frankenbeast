# Issue: `frankenfirewall` Build Script Currently Fails

Severity: high
Area: `frankenfirewall`

## Summary

The package's `npm run build` is currently red.

## Intended Behavior

`cd frankenfirewall && npm run build` should compile cleanly.

## Current Behavior

The build failed on 2026-03-08 with TypeScript errors including:

- `exactOptionalPropertyTypes` incompatibilities in adapter and interceptor code
- outdated import-assertion syntax in tests
- mismatched Claude adapter content typing
- non-exhaustive return flow in `src/server/middleware.ts`

## Evidence

- Reproduction on 2026-03-08:
  - `cd frankenfirewall && npm run build`
- Representative failing files:
  - `frankenfirewall/src/adapters/base-adapter.ts`
  - `frankenfirewall/src/adapters/claude/claude-adapter.ts`
  - `frankenfirewall/src/interceptors/interceptor-result.ts`
  - `frankenfirewall/src/server/middleware.ts`

## Impact

- The package is not releasable from a clean build path.
- Root build automation fails when it reaches `frankenfirewall`.

## Acceptance Criteria

- Make the package build green under its own script.
- Keep build-only regressions covered in CI.
