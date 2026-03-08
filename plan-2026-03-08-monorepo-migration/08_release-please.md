# Chunk 08: Consolidate Release-Please for Monorepo

## Objective

Update root `release-please-config.json` and `.release-please-manifest.json` to manage all 11 packages from the monorepo root. Remove per-module release-please configs that were absorbed from the old repos.

## Files

- **Modify**: `release-please-config.json`
- **Modify**: `.release-please-manifest.json`
- **Delete**: `packages/*/release-please-config.json` (if any exist)
- **Delete**: `packages/*/.release-please-manifest.json` (if any exist)

## Context

Current root `release-please-config.json` only manages `"."` (the root package). Individual module repos had their own release-please configs which were absorbed during the history merge.

The monorepo config must add each package with a `component` name so release-please can track versions independently.

Module versions are all `0.1.0` (check each `package.json` to confirm).

## Success Criteria

- [ ] `release-please-config.json` has entries for root `.` plus all 11 `packages/<module>` paths
- [ ] Each package entry has `"release-type": "node"` and a `"component"` name
- [ ] `.release-please-manifest.json` has version entries for root plus all 11 packages
- [ ] No `release-please-config.json` or `.release-please-manifest.json` files exist inside `packages/*/`
- [ ] JSON is valid (no syntax errors)

## Verification Command

```bash
cd /home/pfk/dev/frankenbeast && \
node -e "const c = require('./release-please-config.json'); const keys = Object.keys(c.packages); console.log('packages:', keys.length); if (keys.length < 12) { process.exit(1); }" && \
node -e "const m = require('./.release-please-manifest.json'); const keys = Object.keys(m); console.log('manifest entries:', keys.length); if (keys.length < 12) { process.exit(1); }" && \
! ls packages/*/release-please-config.json 2>/dev/null && \
! ls packages/*/.release-please-manifest.json 2>/dev/null && \
echo "ALL PASSED"
```

## Hardening Requirements

- Keep the root `"."` entry unchanged — only ADD the package entries
- Use `"component"` field so release-please creates separate changelogs per package
- Do NOT change any `package.json` version numbers — release-please manages those
- Verify versions in manifest match actual `package.json` versions for each module
- Commit: `chore: consolidate release-please config for monorepo layout`
