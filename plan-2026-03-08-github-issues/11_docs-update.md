# Chunk 11: Documentation Updates

## Objective

Update all project documentation to reflect the new `issues` subcommand: ARCHITECTURE.md, RAMP_UP.md, PROGRESS.md, and add a quickstart guide.

## Files

- **Modify**: `docs/ARCHITECTURE.md` (add issues pipeline to diagrams and component list)
- **Modify**: `docs/RAMP_UP.md` (add issues subcommand, update known limitations)
- **Modify**: `docs/PROGRESS.md` (log the feature implementation)
- **Create**: `docs/guides/fix-github-issues.md` (quickstart guide)

## Success Criteria

- [ ] `ARCHITECTURE.md`: Mermaid system diagram updated with issues pipeline (fetch → triage → review → execute)
- [ ] `ARCHITECTURE.md`: New "Issues Pipeline" section describing IssueFetcher, IssueTriage, IssueGraphBuilder, IssueReview, IssueRunner
- [ ] `ARCHITECTURE.md`: Component interaction diagram shows how issues flow into existing BeastLoop execution
- [ ] `RAMP_UP.md`: CLI section updated with `frankenbeast issues` subcommand and all flags
- [ ] `RAMP_UP.md`: Orchestrator internals file tree updated with `src/issues/` directory
- [ ] `RAMP_UP.md`: Known limitations updated (remove any that this feature addresses)
- [ ] `PROGRESS.md`: New entry logging the GitHub issues feature (PR number, test counts, description)
- [ ] `docs/guides/fix-github-issues.md`: Step-by-step quickstart showing typical usage
- [ ] All docs are factually accurate (no stale claims, no aspirational language)

## Verification Command

```bash
# Verify docs exist and are non-empty
test -s docs/ARCHITECTURE.md && test -s docs/RAMP_UP.md && test -s docs/PROGRESS.md && test -s docs/guides/fix-github-issues.md && echo "DOCS OK"
```

## Hardening Requirements

- RAMP_UP.md must stay under 5000 tokens — be concise, remove stale content to make room
- ARCHITECTURE.md Mermaid diagrams must render correctly (valid syntax)
- PROGRESS.md entry should include: PR number, branch, commit count, test count, what changed
- The quickstart guide should show 3 concrete examples:
  1. `frankenbeast issues --label critical` (fix all critical issues)
  2. `frankenbeast issues --search "label:bug label:high"` (GitHub search syntax)
  3. `frankenbeast issues --label build --dry-run` (preview triage without executing)
- Do NOT add speculative "future work" sections — only document what exists
- Do NOT pad docs with filler — every sentence should carry information
