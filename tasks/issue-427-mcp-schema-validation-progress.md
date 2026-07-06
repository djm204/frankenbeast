# Issue 427 MCP schema validation progress

- [x] Inspect repository instructions and current MCP server factory/tests
- [x] Implement central schema validation improvements (finite numbers, enums)
- [x] Ensure execute_tool validates target tool args through same validator
- [x] Add focused regression tests for direct calls and proxy path
- [x] Run focused tests/typecheck and broader feasible verification
  - [x] `npm test --workspace=@franken/mcp-suite -- --run src/shared/server-factory.test.ts src/servers/proxy.test.ts`
  - [x] `npm run typecheck --workspace=@franken/mcp-suite`
  - [x] `npm test --workspace=@franken/mcp-suite`
  - [x] `npm run build --workspace=@franken/mcp-suite`
  - [x] `npm run typecheck` attempted; fails in unrelated `@franken/orchestrator` imports of missing `makeTokenSpend` from `@franken/types`
- [ ] Commit intended files
- [ ] Push branch and open PR with Closes #427
- [ ] Run bounded Codex review loop and address real findings or report terminal state
