# Chunk 07: ADR-010 + ARCHITECTURE.md + RAMP_UP.md Updates

## Objective

Write the ADR for pluggable CLI providers, update ARCHITECTURE.md with provider registry diagrams, and update RAMP_UP.md with the new provider system documentation.

Covers original plan Tasks 16, 17, and 18.

## Files

- **Create**: `docs/adr/010-pluggable-cli-providers.md`
- **Modify**: `docs/ARCHITECTURE.md`
- **Modify**: `docs/RAMP_UP.md`
- **Read**: `docs/ARCHITECTURE.md` (CRITICAL: read first, PR #12 updated this)
- **Read**: `docs/RAMP_UP.md` (CRITICAL: read first, PR #12 updated this)

## Success Criteria

- [ ] ADR-010 created with Status: Accepted, documenting the decision to replace hardcoded `'claude' | 'codex'` with `ICliProvider` + `ProviderRegistry`
- [ ] ADR-010 lists consequences: single-file provider addition, provider-agnostic RalphLoop/CliLlmAdapter, config file overrides, Warp deferred
- [ ] ARCHITECTURE.md updated: provider registry shown in Orchestrator Internals component table, provider directory listed
- [ ] ARCHITECTURE.md shows how RalphLoop and CliLlmAdapter consume the registry
- [ ] ARCHITECTURE.md mentions `--provider` and `--providers` CLI flags and config `providers` section
- [ ] RAMP_UP.md orchestrator tree includes `providers/` directory
- [ ] RAMP_UP.md CLI pipeline section mentions all 4 providers and the registry pattern
- [ ] RAMP_UP.md stays under 5000 tokens
- [ ] No docs mention hardcoded `'claude' | 'codex'` union type

## Verification Command

```bash
wc -w docs/RAMP_UP.md && cat docs/adr/010-pluggable-cli-providers.md | head -5
```

## Hardening Requirements

- Read current `ARCHITECTURE.md` and `RAMP_UP.md` FIRST — do not use stale snapshots from the plan
- ADR format must match existing ADRs in `docs/adr/` (check numbering)
- RAMP_UP.md must stay under 5000 tokens — trim if needed
- Remove any remaining references to `'claude' | 'codex'` union type in these docs
- Mention Warp as deferred (terminal host, not CLI agent) per design doc
- Do NOT add aspirational wording — document only what the code now does
