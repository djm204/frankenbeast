# Chunk 12: Documentation Update

## Objective

Update all project documentation to reflect the closed gaps. Remove stale known limitations, add new capabilities, keep everything factually accurate.

## Files

- **Edit**: `docs/RAMP_UP.md`
- **Edit**: `docs/ARCHITECTURE.md`
- **Edit**: `docs/PROGRESS.md`
- **Edit**: `docs/cli-gap-analysis.md`

## Success Criteria

- [ ] `docs/RAMP_UP.md`:
  - Known Limitations section updated — remove items that are no longer true after gap closure
  - CLI section updated: `frankenbeast --design-doc` works, plan/interview phases functional
  - Observer section: real token counting, cost tracking, budget enforcement
  - Config: `--config` flag loads JSON config file
  - Trace viewer: `--verbose` starts viewer on `:4040`
  - Service labels mentioned in CLI output description
  - Stays under 5000 tokens (count and trim if needed)
- [ ] `docs/ARCHITECTURE.md`:
  - Orchestrator Internals section: add `CliLlmAdapter` and `CliObserverBridge` to the component list
  - Add or update Mermaid diagram showing: CLI → CliLlmAdapter → claude --print (for planning) and CLI → CliSkillExecutor → RalphLoop (for execution)
  - Observer wiring: CliObserverBridge bridges IObserverModule ↔ ObserverDeps
- [ ] `docs/PROGRESS.md`:
  - Add entries for each feature PR from this marathon (feat/cli-llm-adapter, feat/cli-observer, etc.)
  - Note this closes the gaps identified in cli-gap-analysis.md
- [ ] `docs/cli-gap-analysis.md`:
  - Each gap marked as CLOSED with the feature branch/PR that resolved it
  - Remediation Priority table updated with status column
  - Add a "Resolution Summary" section at the top
- [ ] All markdown files have no broken links
- [ ] `npm run typecheck` still passes (docs changes shouldn't break anything, but verify)

## Verification Command

```bash
wc -w docs/RAMP_UP.md && test -f docs/ARCHITECTURE.md && test -f docs/PROGRESS.md && test -f docs/cli-gap-analysis.md && echo "PASS"
```

## Hardening Requirements

- RAMP_UP.md MUST stay under 5000 tokens (~3750 words) — this is a hard constraint. If adding new content pushes it over, trim verbose sections.
- Do NOT remove historical entries from PROGRESS.md — only append new ones
- Do NOT delete the gap analysis doc — update it in place with resolution status
- ARCHITECTURE.md Mermaid diagrams must render correctly (test with a Mermaid preview if possible)
- Be factual: only mark a gap as CLOSED if the implementation actually resolves it. If the E2E proof (chunk 11) found new gaps, note them as OPEN.
- Do NOT add speculative future work — only document what exists now
