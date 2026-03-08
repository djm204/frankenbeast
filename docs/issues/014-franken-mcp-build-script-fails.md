# Issue: `franken-mcp` Build Script Currently Fails

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
