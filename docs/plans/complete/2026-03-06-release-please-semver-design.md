# Release-Please + Semantic Versioning

**Date**: 2026-03-06
**Status**: Approved
**Approach**: A — Per-repo config files

## Goal

Add release-please and semantic versioning to all 12 repos (11 modules + root frankenbeast). No npm publishing for now — just changelog generation, version bumps, and GitHub releases.

## Current State

| Module | Has Config | Has Workflow | Action |
|--------|-----------|--------------|--------|
| frankenfirewall | Yes | Yes (full + publish) | No change |
| franken-skills | Yes | Yes (full + publish) | No change |
| franken-critique | No | Yes (basic, no config) | Upgrade: add config files, replace workflow |
| franken-types | No | No | Fresh setup |
| franken-brain | No | No | Fresh setup |
| franken-governor | No | No | Fresh setup |
| franken-heartbeat | No | No | Fresh setup |
| franken-observer | No | No | Fresh setup |
| franken-planner | No | No | Fresh setup |
| franken-orchestrator | No | No | Fresh setup |
| franken-mcp | No | No | Fresh setup |
| frankenbeast (root) | No | No | Fresh setup |

## Artifacts Per Repo

### `release-please-config.json` (identical across all)

```json
{
  "$schema": "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json",
  "packages": {
    ".": {
      "release-type": "node",
      "bump-minor-pre-major": false,
      "bump-patch-for-minor-pre-major": false,
      "changelog-sections": [
        { "type": "feat", "section": "Features" },
        { "type": "feature", "section": "Features" },
        { "type": "fix", "section": "Bug Fixes" },
        { "type": "perf", "section": "Performance" },
        { "type": "chore", "section": "Miscellaneous" },
        { "type": "docs", "section": "Documentation" },
        { "type": "ci", "section": "CI/CD" },
        { "type": "test", "section": "Tests" },
        { "type": "refactor", "section": "Refactoring" },
        { "type": "adr", "section": "Architecture" }
      ]
    }
  }
}
```

### `.release-please-manifest.json` (repo-specific version)

```json
{ ".": "0.1.0" }
```

### `.github/workflows/release-please.yml` (minimal — no publish, no auto-merge)

```yaml
name: Release Please

on:
  push:
    branches: [main]

permissions:
  contents: write
  pull-requests: write

jobs:
  release-please:
    runs-on: ubuntu-latest
    steps:
      - name: Release Please
        uses: googleapis/release-please-action@v4
        with:
          config-file: release-please-config.json
          manifest-file: .release-please-manifest.json
```

## Implementation Plan

### Step 1: Fresh setup — 9 modules (parallelizable)

For each of these repos, create 3 files on main branch:
- franken-types
- franken-brain
- franken-governor
- franken-heartbeat
- franken-observer
- franken-planner
- franken-orchestrator
- franken-mcp
- frankenbeast (root)

Each repo:
1. `cd` into the module directory
2. Create `release-please-config.json`
3. Create `.release-please-manifest.json`
4. Create `.github/workflows/release-please.yml`
5. Commit: `ci: add release-please config and workflow`
6. Push to main

### Step 2: Upgrade franken-critique

1. `cd franken-critique`
2. Create `release-please-config.json`
3. Create `.release-please-manifest.json`
4. Replace `.github/workflows/release.yml` with `.github/workflows/release-please.yml`
5. Remove old `.github/workflows/release.yml`
6. Commit: `ci: upgrade to config-based release-please`
7. Push to main

### Step 3: Verify

After pushing to main on each repo, release-please will:
- Run on the next push to main
- Create a release PR if there are releasable commits
- The release PR bumps version in package.json, creates CHANGELOG.md

No manual verification needed — it's fire-and-forget. The next `feat:` or `fix:` commit to main triggers a release PR.

## What's NOT changing

- frankenfirewall and franken-skills workflows (already have publish + auto-merge — leave as-is)
- No npm publishing for any repo
- No auto-merge (requires GitHub App token setup)
- No CI workflow changes

## Future Additions (not in scope)

- npm publish job (when ready to release packages)
- Auto-merge via GitHub App token
- Cross-repo version coordination
- Dependency update automation (renovate/dependabot)
