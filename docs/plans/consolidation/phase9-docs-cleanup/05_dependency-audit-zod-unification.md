# Chunk 9.5: Dependency Audit + Zod Unification

**Phase:** 9 — Documentation + Cleanup
**Depends on:** Phase 8 (all functional work complete)
**Estimated size:** Small (~15 min audit + targeted edits)

---

## Purpose

The consolidation removes 5 packages, rewrites brain, and adds provider adapters + skill loading — all of which change the dependency graph. No prior chunk explicitly audits for:

1. **Orphaned transitive deps** — npm packages that surviving packages only needed for deleted-package integration (e.g., a lib pulled in solely to talk to heartbeat or firewall)
2. **Zod version convergence** — `franken-heartbeat` used `zod/v4` while the rest used `zod 3.24`. Heartbeat is deleted in Phase 1, but no chunk verifies the remaining 8 packages are on a single Zod version

Phase 1 chunk 06 greps for deleted *package names* in `*.json`, which catches direct `@frankenbeast/heartbeat` references. But it doesn't catch a dependency like `some-lib` that was only used for heartbeat integration and is now dead weight.

## What to Do

### 1. Audit each surviving package's `package.json`

For each of the 8 packages, review `dependencies` and `devDependencies`:

```bash
for pkg in franken-types franken-brain franken-planner franken-critique \
           franken-governor franken-observer franken-orchestrator franken-web; do
  echo "=== packages/$pkg/package.json ==="
  cat "packages/$pkg/package.json" | jq '.dependencies // {} | keys'
  cat "packages/$pkg/package.json" | jq '.devDependencies // {} | keys'
done
```

For each dependency, verify it is still imported somewhere in the package's `src/` or `tests/`:

```bash
for pkg in packages/*/; do
  echo "=== $pkg ==="
  deps=$(cat "$pkg/package.json" | jq -r '(.dependencies // {}) + (.devDependencies // {}) | keys[]')
  for dep in $deps; do
    # Skip @types/ packages — they're used implicitly
    [[ "$dep" == @types/* ]] && continue
    # Skip @frankenbeast/ packages — cross-refs are structural
    [[ "$dep" == @frankenbeast/* ]] && continue
    count=$(grep -r "$dep" "$pkg/src" "$pkg/tests" --include="*.ts" -l 2>/dev/null | wc -l)
    if [ "$count" -eq 0 ]; then
      echo "  UNUSED? $dep (0 imports found)"
    fi
  done
done
```

Remove any confirmed-unused dependencies.

### 2. Unify Zod version

Check current Zod versions across all packages:

```bash
grep -r '"zod"' packages/*/package.json
```

All packages that depend on Zod must use the same major.minor version. If any package uses `zod/v4` imports (the `zod/v4` subpath export), convert to standard `zod` imports — the v4 subpath was only used by heartbeat which is now deleted, but verify no copied code retained the pattern.

```bash
# Check for zod/v4 import pattern
grep -r "from 'zod/v4'" packages/ --include="*.ts"
grep -r 'from "zod/v4"' packages/ --include="*.ts"
```

Pin all packages to the same Zod version in their `package.json`. Use the highest 3.x version already present.

### 3. Check root package.json

Verify no stale workspace-level devDependencies reference tools or libs that only existed for deleted packages.

### 4. Clean install + verify

```bash
rm -rf node_modules packages/*/node_modules package-lock.json
npm install
npm run build
npm run typecheck
npm test
```

A clean lockfile regeneration ensures no phantom transitive deps linger.

## Files

- **Modify:** `packages/*/package.json` — remove unused deps, align Zod versions
- **Modify:** `package.json` (root) — remove any stale workspace-level deps
- **Regenerate:** `package-lock.json` — clean lockfile after dep changes

## Exit Criteria

- Every dependency in every `package.json` has at least one corresponding import in that package's `src/` or `tests/`
- All packages that use Zod depend on the same version
- Zero `zod/v4` import paths remain in the codebase
- `package-lock.json` is regenerated cleanly
- `npm run build && npm run typecheck && npm test` all green
