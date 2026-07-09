# Issue: `franken-mcp` Build Script Currently Fails

> **Historical archive notice (2026-07-09):** This document is preserved from the pre-consolidation 2026-03 audit. It may mention removed packages such as `franken-mcp`, `frankenfirewall`, `franken-comms`, `franken-heartbeat`, or legacy root scripts such as `test:all`. Use the status annotations in `docs/issues/INDEX.md` and the live `package.json`/`packages/*` workspaces as the source of truth for current contributor work.

Severity: high
Area: `franken-mcp`

## Summary

`franken-mcp` tests pass, but the package does not compile under `npm run build`.

## Intended Behavior

The package should compile cleanly if it is part of the monorepo and described as a shipped package.

## Current Behavior

The build failed on 2026-03-08 with TypeScript errors including:

- `exactOptionalPropertyTypes` incompatibility in `mcp-client.ts` when passing resolved constraints
- constructor property assignment issues in `McpRegistryError`

## Evidence

- Reproduction on 2026-03-08:
  - `cd franken-mcp && npm run build`
- Representative failing files:
  - `franken-mcp/src/client/mcp-client.ts:122-125`
  - `franken-mcp/src/types/mcp-registry-error.ts:16-26`

## Impact

- The package cannot be reliably published or consumed from source.
- The failure is currently hidden by the root build/test scripts because they skip `franken-mcp`.

## Acceptance Criteria

- Make `franken-mcp` build green.
- Add it to the root build/test coverage so regressions are visible.
