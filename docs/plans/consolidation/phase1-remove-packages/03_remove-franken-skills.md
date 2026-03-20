# Chunk 1.3: Remove franken-skills

**Phase:** 1 — Remove Dead Packages
**Depends on:** Phase 0 (clean main)
**Estimated size:** Small-Medium (deletion + import cleanup + dep-factory temporary pass-through)

---

## Context

`franken-skills` was a static skill registry with manifest-based loading. In the consolidated architecture, skills are marketplace-first MCP servers managed via directory-based `mcp.json` configs. The `SkillManager` (Phase 5) replaces this entirely.

## What to Do

### 1. Delete the package directory

```bash
rm -rf packages/franken-skills/
```

### 2. Remove workspace references

- **`package.json` (root):** Remove `packages/franken-skills` from `workspaces`
- **`turbo.json`:** Remove pipeline entries
- **`tsconfig.json` (root):** Remove from `references`

### 3. Find and fix all imports

```bash
grep -r "@frankenbeast/skills" packages/ --include="*.ts" --include="*.tsx"
grep -r "franken-skills" packages/ --include="*.ts" --include="*.tsx" --include="*.json"
```

**Key location: `dep-factory.ts`**

The orchestrator's `dep-factory.ts` dynamically imports the skills module:
```typescript
if (modules?.includes('skills')) {
  const skills = await import('@frankenbeast/skills');
  // ...
}
```

Replace with:
```typescript
// TODO: Phase 5 — SkillManager replaces static skill registry with marketplace-first MCP loading
```

**Keep the `filteredSkills` variable** and any logic that passes a skill list to downstream consumers. This variable will be rewired to `SkillManager.loadForProvider()` in Phase 5.

### 4. Run verification

```bash
npm install
npm run build
npm run typecheck
npm test
```

## Known References

- `packages/franken-orchestrator/src/cli/dep-factory.ts` — dynamic skills module import
- `packages/franken-orchestrator/package.json` — `@frankenbeast/skills` dependency
- Any skill-related test fixtures or integration tests

## Files

- **Delete:** `packages/franken-skills/` (entire directory)
- **Modify:** Root `package.json`, root `tsconfig.json`
- **Modify:** `packages/franken-orchestrator/src/cli/dep-factory.ts` — remove dynamic import, keep filteredSkills variable, leave TODO
- **Modify:** `packages/franken-orchestrator/package.json` — remove `@frankenbeast/skills` dependency

## Exit Criteria

- `packages/franken-skills/` does not exist
- `grep -r "@frankenbeast/skills" packages/` returns zero results
- `filteredSkills` logic in `dep-factory.ts` still exists (will be rewired in Phase 5)
- `npm install && npm run build && npm run typecheck` succeeds
