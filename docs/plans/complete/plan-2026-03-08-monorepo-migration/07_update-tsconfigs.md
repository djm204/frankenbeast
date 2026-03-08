# Chunk 07: Update TypeScript Configs for packages/ Layout

## Objective

Update root `tsconfig.json` path aliases and `tsconfig.test.json` includes to reference `packages/` instead of root-level module directories.

## Files

- **Modify**: `tsconfig.json`
- **Modify**: `tsconfig.test.json`

## Context

Current root `tsconfig.json` has path aliases like:
```json
"@franken/firewall": ["./frankenfirewall/src/index.ts"]
```

These must change to:
```json
"@franken/firewall": ["./packages/frankenfirewall/src/index.ts"]
```

Full alias mapping:

| Alias | Old path | New path |
|-------|----------|----------|
| @franken/firewall | ./frankenfirewall/src/index.ts | ./packages/frankenfirewall/src/index.ts |
| @franken/skills | ./franken-skills/src/index.ts | ./packages/franken-skills/src/index.ts |
| franken-brain | ./franken-brain/src/index.ts | ./packages/franken-brain/src/index.ts |
| franken-planner | ./franken-planner/src/index.ts | ./packages/franken-planner/src/index.ts |
| @frankenbeast/observer | ./franken-observer/src/index.ts | ./packages/franken-observer/src/index.ts |
| @franken/critique | ./franken-critique/src/index.ts | ./packages/franken-critique/src/index.ts |
| @franken/governor | ./franken-governor/src/index.ts | ./packages/franken-governor/src/index.ts |
| franken-heartbeat | ./franken-heartbeat/src/index.ts | ./packages/franken-heartbeat/src/index.ts |
| @franken/types | ./franken-types/src/index.ts | ./packages/franken-types/src/index.ts |
| franken-orchestrator | ./franken-orchestrator/src/index.ts | ./packages/franken-orchestrator/src/index.ts |
| @franken/mcp | (not currently listed — add it) | ./packages/franken-mcp/src/index.ts |

`tsconfig.test.json` includes like `"franken-brain/src/**/*"` become `"packages/franken-brain/src/**/*"`.

## Success Criteria

- [ ] All 11 path aliases in `tsconfig.json` point to `./packages/<module>/src/index.ts`
- [ ] `tsconfig.test.json` includes reference `packages/<module>/src/**/*`
- [ ] `npx turbo run typecheck` passes for all modules
- [ ] No references to root-level module paths remain in either tsconfig file

## Verification Command

```bash
cd /home/pfk/dev/frankenbeast && \
! grep -E '"\./(franken-|frankenfirewall/)' tsconfig.json && echo "tsconfig.json paths: OK" && \
! grep -E '"(franken-|frankenfirewall/)' tsconfig.test.json && echo "tsconfig.test.json: OK" && \
npx turbo run typecheck 2>&1 | tail -5 && \
echo "ALL PASSED"
```

## Hardening Requirements

- Do NOT modify individual module `tsconfig.json` files — they use relative paths (`src/`, `dist/`) that are still correct
- Keep `"include": []` in root `tsconfig.json` — it's intentionally empty (path aliases only)
- The `@franken/mcp` alias may not exist in current config — add it if missing
- Commit: `chore: update tsconfig paths for packages/ layout`
