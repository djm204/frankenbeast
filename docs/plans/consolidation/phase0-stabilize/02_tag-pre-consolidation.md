# Chunk 0.2: Tag Pre-Consolidation State

**Phase:** 0 — Stabilize Current Branch
**Depends on:** Chunk 0.1 (PR #241 merged)
**Estimated size:** Trivial (git commands only)

---

## Purpose

Create an escape-hatch tag on `main` before the consolidation begins. If the consolidation goes sideways (broken imports cascade, brain rewrite loses functionality, etc.), we can `git reset --hard v0.pre-consolidation` and start over without losing any Plan 1 work.

## What to Do

### 1. Verify main is clean

```bash
git checkout main
git pull origin main
npm test && npm run build && npm run typecheck
git status  # should be clean
```

### 2. Create the tag

```bash
git tag v0.pre-consolidation -m "Pre-consolidation baseline: 13 packages, Plan 1 complete"
git push origin v0.pre-consolidation
```

### 3. Create the consolidation branch

```bash
git checkout -b feat/architecture-consolidation
git push -u origin feat/architecture-consolidation
```

## Exit Criteria

- `v0.pre-consolidation` tag exists on the `main` commit where PR #241 was merged
- Tag is pushed to remote
- `feat/architecture-consolidation` branch exists, branched from tagged commit
- `main` passes all tests at the tagged commit
