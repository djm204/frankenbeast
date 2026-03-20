# Chunk 1.2: Remove franken-mcp

**Phase:** 1 — Remove Dead Packages
**Depends on:** Phase 0 (clean main)
**Estimated size:** Small-Medium (deletion + import cleanup + dep-factory temporary pass-through)

---

## Context

`franken-mcp` was a custom MCP server registry. In the consolidated architecture, the orchestrator connects to MCP servers directly as a client via `@modelcontextprotocol/sdk`. No custom MCP server hosting — just client connections to external MCP servers.

## What to Do

### 1. Delete the package directory

```bash
rm -rf packages/franken-mcp/
```

### 2. Remove workspace references

- **`package.json` (root):** Remove `packages/franken-mcp` from `workspaces`
- **`turbo.json`:** Remove pipeline entries
- **`tsconfig.json` (root):** Remove from `references`

### 3. Find and fix all imports

```bash
grep -r "@frankenbeast/mcp" packages/ --include="*.ts" --include="*.tsx"
grep -r "franken-mcp" packages/ --include="*.ts" --include="*.tsx" --include="*.json"
```

**Key location: `dep-factory.ts`**

The orchestrator's `dep-factory.ts` has a dynamic import for MCP module toggling:
```typescript
// Something like:
if (modules?.includes('mcp')) {
  const mcp = await import('@frankenbeast/mcp');
  // ...
}
```

Replace this with:
```typescript
// TODO: Phase 5 — SkillManager replaces MCP module with marketplace-first skill loading
// MCP client connections will use @modelcontextprotocol/sdk directly
```

The `filteredSkills` logic in `dep-factory.ts` should stay — it will be rewired to the new `SkillManager` in Phase 5.

### 4. Run verification

```bash
npm install
npm run build
npm run typecheck
npm test
```

## Known References

- `packages/franken-orchestrator/src/cli/dep-factory.ts` — dynamic MCP module import
- `packages/franken-orchestrator/package.json` — `@frankenbeast/mcp` dependency
- Any MCP-related test fixtures in the orchestrator

## Files

- **Delete:** `packages/franken-mcp/` (entire directory)
- **Modify:** Root `package.json`, root `tsconfig.json`
- **Modify:** `packages/franken-orchestrator/src/cli/dep-factory.ts` — remove dynamic import, leave TODO
- **Modify:** `packages/franken-orchestrator/package.json` — remove `@frankenbeast/mcp` dependency

## Exit Criteria

- `packages/franken-mcp/` does not exist
- `grep -r "@frankenbeast/mcp" packages/` returns zero results
- `dep-factory.ts` no longer attempts to import `@frankenbeast/mcp`
- `filteredSkills` logic in `dep-factory.ts` still exists (for Phase 5 rewiring)
- `npm install && npm run build && npm run typecheck` succeeds
