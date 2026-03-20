# Phase 1: Remove Dead Packages

**Goal:** Remove 4 packages (franken-mcp, franken-skills, franken-heartbeat, frankenfirewall) and absorb 1 package (franken-comms → orchestrator). Fix all broken imports. End with 8 packages, all tests passing.

**Dependencies:** Phase 0 (clean `main` with tag)

**Why this matters:** Mostly subtraction — 4 packages are deleted (their functionality is replaced by new components in later phases). franken-comms is **absorbed** into the orchestrator because its bidirectional Slack/Discord/Telegram/WhatsApp integration is real operational functionality. Every subsequent phase depends on a clean 8-package monorepo.

---

## Packages Being Removed

| Package | Current Role | Disposition |
|---------|-------------|-------------|
| `franken-comms` | Bidirectional Slack/Discord/Telegram/WhatsApp integration | **Absorbed** into orchestrator at `src/comms/`. ChatGateway, channel adapters, signature verification, session mapping, HITL approval buttons all preserved. |
| `franken-mcp` | MCP server registry | Gone. Orchestrator uses `@modelcontextprotocol/sdk` directly. |
| `franken-skills` | Static skill registry | Replaced by marketplace-first MCP + directory-based `mcp.json`. |
| `franken-heartbeat` | Reflection + checkpointing + self-assessment | Split: reflection → critique evaluator (Phase 6), checkpointing → orchestrator, self-assessment → orchestrator config flag. |
| `frankenfirewall` | LLM proxy with input validation + output filtering | Absorbed into orchestrator as LLM middleware (Phase 4). 2-3 functions, not a package. |

## Approach

Delete one package at a time, fixing broken imports after each deletion. This is safer than deleting all 5 at once — if something breaks, you know exactly which deletion caused it.

For each deleted package:
1. Delete the `packages/<name>/` directory
2. Remove from root `package.json` workspaces array
3. Remove from `turbo.json` pipeline if referenced
4. Remove from `tsconfig.json` references
5. Grep for `@frankenbeast/<name>` imports across the entire repo
6. For each import found: remove entirely, or replace with a temporary pass-through that preserves the interface contract with a `// TODO: Phase N will replace this with real implementation` comment. Pass-throughs must satisfy the type signature and may delegate to a no-op, but must be tracked and replaced by the phase indicated — no stubs ship as final product.
7. Run `npm test && npm run build && npm run typecheck`

## Success Criteria

- 8 packages remain under `packages/`
- No references to `@frankenbeast/comms`, `@frankenbeast/mcp`, `@frankenbeast/skills`, `@frankenbeast/heartbeat`, or `@frankenbeast/firewall` anywhere in the codebase
- `npm test` passes
- `npm run build` succeeds
- `npm run typecheck` clean
- `.gitignore` still covers all generated artifacts

## Chunks

| # | Chunk | Committable Unit | Can Parallel? |
|---|-------|-----------------|--------------|
| 01 | [Absorb franken-comms](phase1-remove-packages/01_remove-franken-comms.md) | Move code to orchestrator + fix imports | Yes (with 02-05) |
| 02 | [Remove franken-mcp](phase1-remove-packages/02_remove-franken-mcp.md) | Delete package + fix imports | Yes (with 01,03-05) |
| 03 | [Remove franken-skills](phase1-remove-packages/03_remove-franken-skills.md) | Delete package + fix imports | Yes (with 01-02,04-05) |
| 04 | [Remove franken-heartbeat](phase1-remove-packages/04_remove-franken-heartbeat.md) | Delete package + fix imports | Yes (with 01-03,05) |
| 05 | [Remove frankenfirewall](phase1-remove-packages/05_remove-frankenfirewall.md) | Delete package + fix imports | Yes (with 01-04) |
| 06 | [Fix all tests + critical test audit + verify clean build](phase1-remove-packages/06_fix-all-tests.md) | Final verification + delete ~1,000–1,400 low-value tests | After 01-05 |

**Parallelism:** Chunks 01–05 are independent deletions that can run in parallel. Chunk 06 runs after all deletions to catch cross-cutting breakage and audit the full test suite.

## Risks

| Risk | Mitigation |
|------|-----------|
| Cascading import failures | Delete one at a time, test after each. The `v0.pre-consolidation` tag is the escape hatch. |
| Dynamic imports hide broken references | Grep for both `@frankenbeast/<name>` (static) and string literals containing the package name (dynamic). Check `dep-factory.ts` specifically — it uses dynamic imports for optional modules. |
| Test count drops significantly | Expected. Track before/after test counts. Tests that tested deleted functionality are removed; tests that tested integration points get temporary pass-throughs that are replaced with real implementations in later phases. |
