# Chunk 1.5: Remove frankenfirewall

**Phase:** 1 — Remove Dead Packages
**Depends on:** Phase 0 (clean main)
**Estimated size:** Medium (deletion + import cleanup + temporary pass-through)

---

## Context

`frankenfirewall` is an LLM proxy that validates inputs (injection detection) and filters outputs (PII masking, response validation). In the consolidated architecture, this becomes orchestrator middleware (Phase 4).

The useful logic (injection patterns, PII rules, validation) will be extracted from git history in Phase 4. For now, we just delete the package and replace integration points with pass-through no-ops.

## What to Do

### 1. Delete the package directory

```bash
rm -rf packages/frankenfirewall/
```

### 2. Remove workspace references

- **`package.json` (root):** Remove `packages/frankenfirewall` from `workspaces`
- **`turbo.json`:** Remove pipeline entries
- **`tsconfig.json` (root):** Remove from `references`

### 3. Find and fix all imports

```bash
grep -r "@frankenbeast/firewall" packages/ --include="*.ts" --include="*.tsx"
grep -r "frankenfirewall" packages/ --include="*.ts" --include="*.tsx" --include="*.json"
```

**Key locations in the orchestrator:**

1. **Ingestion phase** — the Beast Loop's ingestion phase calls the firewall to validate incoming prompts before sending to the LLM. Replace with pass-through:
   ```typescript
   // TODO: Phase 4 — LlmMiddleware.beforeRequest() replaces firewall input validation
   // For now, pass input through unmodified
   ```

2. **Response handling** — firewall may filter LLM responses before returning to the user. Replace with pass-through:
   ```typescript
   // TODO: Phase 4 — LlmMiddleware.afterResponse() replaces firewall output filtering
   ```

3. **`dep-factory.ts`** — dynamic import for firewall module. Remove the import, replace with pass-through no-op.

### 4. Preserve test knowledge

Before deleting, note which firewall tests exist and what patterns they test. These will inform Phase 4's middleware implementation. The tests themselves will be recreated as middleware tests, but knowing what the existing tests covered prevents regression:

```bash
ls packages/frankenfirewall/tests/
```

Document the test names and what they verify in a comment or in the Phase 4 chunk spec.

### 5. Run verification

```bash
npm install
npm run build
npm run typecheck
npm test
```

## Known References

- `packages/franken-orchestrator/src/cli/dep-factory.ts` — dynamic firewall import
- `packages/franken-orchestrator/src/` — ingestion phase calls, response filtering
- `packages/franken-orchestrator/package.json` — `@frankenbeast/firewall` dependency

## Files

- **Delete:** `packages/frankenfirewall/` (entire directory)
- **Modify:** Root `package.json`, root `tsconfig.json`
- **Modify:** `packages/franken-orchestrator/src/cli/dep-factory.ts` — remove dynamic import, add pass-through
- **Modify:** Beast Loop ingestion/response phases — replace firewall calls with pass-through
- **Modify:** `packages/franken-orchestrator/package.json` — remove dependency

## Exit Criteria

- `packages/frankenfirewall/` does not exist
- `grep -r "@frankenbeast/firewall" packages/` returns zero results
- Beast Loop ingestion phase still works (pass-through where firewall was)
- `npm install && npm run build && npm run typecheck` succeeds
