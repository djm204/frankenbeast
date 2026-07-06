# issue-405-progress.md

- [x] Inspect current MCP memory schemas and brain adapter behavior for `recovery` type exposure.
- [x] Confirm there is no underlying recovery memory store/type in `@franken/brain` and identify mismatch.
- [x] Update MCP memory tool schema/docs in `servers/memory.ts` to advertise only supported types: `working` and `episodic`.
- [x] Update shared MCP tool registry schema in `shared/tool-registry.ts` to match.
- [x] Add adapter-side guard in `adapters/brain-adapter.ts` to reject unsupported memory types.
- [x] Add/extend tests:
  - [x] `servers/memory.test.ts` asserts schema enum/description mentions only `working`, `episodic`.
  - [x] `adapters/brain-adapter.test.ts` validates supported types and rejects `recovery`.
- [x] Run verification:
  - [x] `npm run test` (package `packages/franken-mcp-suite`)
  - [x] `npm run typecheck` (repo root)
  - [x] `npm run build` (repo root)