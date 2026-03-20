# Chunk 9.4: Final Cleanup

**Phase:** 9 — Documentation + Cleanup
**Depends on:** Chunks 9.1–9.3 (docs updated)
**Estimated size:** Small (~30 lines changes)

---

## Purpose

Verify all Phase 1 temporary pass-throughs have been replaced with real implementations, verify `.gitignore` coverage for new artifacts, and run the full CI pipeline to confirm green.

## Checklist

### 1. Verify All Temporary Pass-Throughs Replaced

Phase 1 left temporary pass-throughs where deleted packages were imported. Phase 8 must have replaced all of them with real adapter classes. Search for any remaining — **any found is a blocker, not a cleanup task**:

```bash
# Search for Phase 1 TODO markers
grep -r "TODO.*Phase 1" packages/
grep -r "TODO.*consolidation" packages/
grep -r "STUB.*deleted" packages/

# Search for imports of deleted packages
grep -r "franken-comms" packages/ --include="*.ts"
grep -r "franken-mcp" packages/ --include="*.ts"
grep -r "franken-skills" packages/ --include="*.ts"
grep -r "franken-heartbeat" packages/ --include="*.ts"
grep -r "frankenfirewall" packages/ --include="*.ts"
```

Remove any found. These should not exist after Phase 8.

### 2. Verify .gitignore Coverage

New artifacts introduced by the consolidation:

| Artifact | Pattern | Location |
|----------|---------|----------|
| SQLite database files | `*.db`, `*.db-shm`, `*.db-wal` | Root `.gitignore` |
| Temp MCP config files | `*.mcp-temp.json` | Root `.gitignore` |
| Skill directory env files | `skills/**/.env` | Root `.gitignore` |
| `.frankenbeast/` config dir | `.frankenbeast/` | Root `.gitignore` |
| Dashboard build output | `packages/franken-web/dist/` | Already covered by `dist/` |

Verify each is in `.gitignore`. Add any missing patterns.

### 3. Verify Workspace Config

After removing 5 packages, `package.json` workspaces should list only 8:

```json
{
  "workspaces": [
    "packages/franken-types",
    "packages/franken-brain",
    "packages/franken-planner",
    "packages/franken-observer",
    "packages/franken-critique",
    "packages/franken-governor",
    "packages/franken-web",
    "packages/franken-orchestrator"
  ]
}
```

### 4. Full CI Pipeline

```bash
# Clean install
rm -rf node_modules packages/*/node_modules
npm install

# Full build + type check + test
npm run build
npm run typecheck
npm test

# Verify no TypeScript errors
npx tsc --noEmit
```

All must pass green.

### 5. Verify No Stale Cross-Package References

```bash
# Check that tsconfig references don't point to deleted packages
grep -r "franken-comms\|franken-mcp\|franken-skills\|franken-heartbeat\|frankenfirewall" \
  packages/*/tsconfig.json \
  tsconfig.json \
  turbo.json \
  package.json
```

Remove any found.

## Files

- **Modify:** `.gitignore` — add any missing patterns
- **Modify:** `package.json` — verify workspaces list
- **Modify:** Any files with remaining temporary pass-throughs from Phase 1 (must be replaced with real implementations, not just removed)
- **Modify:** Any `tsconfig.json` or `turbo.json` with stale references

## Exit Criteria

- Zero temporary pass-throughs from Phase 1 remain — all replaced with real implementations
- Zero imports of deleted packages remain
- `.gitignore` covers SQLite files, temp MCP configs, `.frankenbeast/` dir
- `package.json` workspaces lists exactly 8 packages
- No stale `tsconfig.json` or `turbo.json` references to deleted packages
- `npm install && npm run build && npm run typecheck && npm test` all green
