# Chunk 11: Documentation & Cleanup

## Objective

Update README, PROGRESS.md, and ARCHITECTURE.md to reflect the closed execution gap. Remove "Known Limitations" about stub execution. Add CLI usage examples.

## Files

- Modify: `README.md`
- Modify: `docs/PROGRESS.md`
- Modify: `docs/ARCHITECTURE.md`

## Success Criteria

- [ ] README "Known Limitations" section updated — remove `executeTask() is stub-level` and `CLI requires --dry-run`
- [ ] README adds "Quick Start" section with real CLI usage example:
  ```bash
  export ANTHROPIC_API_KEY=sk-...
  npx frankenbeast --project-id demo --provider anthropic --goal "Explain TDD in 3 sentences"
  ```
- [ ] README documents available providers: `anthropic`, `openai`, `local-ollama`
- [ ] README documents `--verbose` flag for debug logging
- [ ] PROGRESS.md updated with new completed items: execution gap closed, logger added, CLI fully functional
- [ ] ARCHITECTURE.md updated: Phase 3 execution section reflects real skill dispatch (not stub)
- [ ] ARCHITECTURE.md documents the Logger utility and logging levels
- [ ] ARCHITECTURE.md documents the deps factory pattern

## Verification Command

```bash
cd franken-orchestrator && npx tsc --noEmit
```

## Hardening Requirements

- Do NOT add aspirational features to docs — only document what actually works
- Keep README concise — link to ARCHITECTURE.md for details
- PROGRESS.md entries should include the date
- ARCHITECTURE.md Mermaid diagrams should be updated if the data flow changed
- Mention that MCP support is wired but not yet active (mcp field is undefined)
- Mention that Memory is in-memory only (no persistent storage yet)
