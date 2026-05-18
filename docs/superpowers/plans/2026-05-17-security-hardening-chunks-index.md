# Security Hardening — Chunked Plan Index

**Source:** `docs/audits/agent-systems-audit-2026-04-28.md` and the monolithic
`docs/superpowers/plans/2026-04-28-agent-systems-audit-gap-fill-plan.md`.

**Status basis:** Every gap below was re-verified against current `main`
(`origin/main` @ `610a0ea`) on 2026-05-17 — confirmed unimplemented in code,
not merely unchecked in docs. Verification evidence is in each chunk plan.

This index splits the gap-fill work into four **independently shippable**
chunks. Each chunk has its own plan file, produces working/testable software on
its own, and ends with its own ADR + audit follow-up so it can merge alone.

## Chunks

| # | Chunk | Orig tasks | Subsystems | Risk | Plan |
|---|-------|-----------|------------|------|------|
| 1 | Fail-Closed HTTP & Approval Boundaries | T1 | orchestrator http+cli, governor | **Critical** — unauthenticated chat routes, unconditional non-TTY auto-approve, fail-open signature config | `2026-05-17-sechard-1-failclosed-boundaries.md` |
| 2 | MCP Schema Enforcement & Firewall Path Containment | T2 | mcp-suite | **Critical** — unvalidated MCP tool args, arbitrary-path file read | `2026-05-17-sechard-2-mcp-firewall-containment.md` |
| 3 | Sandboxed Beast Execution | T3+T4 | orchestrator beasts/execution | **High** — container mode is a throwing placeholder, process mode inherits host secrets | `2026-05-17-sechard-3-sandboxed-execution.md` |
| 4 | Durable Audit & Replay | T5+T6 | observer, orchestrator beast-loop | **Medium** — replay is timeline-only, phase state is in-memory | `2026-05-17-sechard-4-durable-audit-replay.md` |

## Dependency & Execution Order

```
Chunk 1 ─┐
Chunk 2 ─┼─ independent of each other; 1 & 2 are highest priority, parallelizable
Chunk 3 ─┘
Chunk 4 ── independent structurally; sequence LAST (replay/state-persistence is
            most valuable once execution is sandboxed and boundaries are closed)
```

No chunk imports another chunk's new modules. Chunk 3 defines
`SandboxPolicy` / `DEFAULT_BEAST_ENV_ALLOWLIST`; nothing outside Chunk 3 depends
on it, so ordering between 1/2/3 is by risk priority, not by build dependency.

**Recommended order:** 1 → 2 → 3 → 4. If parallelizing, run 1 and 2 in separate
worktrees (disjoint file sets — `franken-orchestrator+governor` vs
`franken-mcp-suite`), then 3, then 4.

## ADR Numbering

`docs/adr/033-*` is already taken (beast-run-resume). This work uses:

- Chunk 1 → `docs/adr/034-fail-closed-http-and-approval-boundaries.md`
- Chunk 2 → `docs/adr/035-mcp-input-validation-and-path-containment.md`
- Chunk 3 → `docs/adr/036-sandboxed-beast-execution.md`
- Chunk 4 → `docs/adr/037-durable-audit-and-deterministic-replay.md`

## Deliberately Out Of Scope (carried from source plan)

- OIDC / downscoped cloud-token issuance — separate future spec.
- gVisor / Firecracker micro-VM backend — Docker `--network none` is the first
  concrete backend; do not market it as micro-VM isolation.
- An independently permissioned monitor *process* — Chunk 4's records/state are
  prerequisites, but the monitor process itself is a later effort.

## Re-Audit Discipline

Each chunk's final task appends a `Follow-Up Implementation Status` row set to
`docs/audits/agent-systems-audit-2026-04-28.md` mapping its original audit gap
lines to `fixed | partially-fixed | still-open`. The audit file is the single
source of truth for remaining risk after each merge.
