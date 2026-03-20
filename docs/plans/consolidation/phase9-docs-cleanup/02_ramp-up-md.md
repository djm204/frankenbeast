# Chunk 9.2: Update RAMP_UP.md

**Phase:** 9 — Documentation + Cleanup
**Depends on:** Phase 8 (all components wired)
**Estimated size:** Small (~100 lines documentation)

---

## Purpose

Rewrite `docs/RAMP_UP.md` to reflect the consolidated 8-package architecture. Must stay under 5000 tokens (user requirement). Remove all references to deleted packages. Add provider configuration quickstart.

## Current State

The existing RAMP_UP.md references 13 packages including franken-comms, franken-mcp, franken-skills, franken-heartbeat, and frankenfirewall — all deleted in Phase 1.

## Content Structure

### 1. What Is Frankenbeast? (2-3 sentences)

Deterministic guardrails framework for AI agents. Orchestrates multiple LLM providers with automatic failover, persistent memory, marketplace skills, and audit trails.

### 2. Package Map (compact table)

| Package | Role |
|---------|------|
| `franken-types` | Shared types + Zod schemas |
| `franken-brain` | SQLite memory (working, episodic, recovery) |
| `franken-planner` | DAG task planning |
| `franken-observer` | Audit trail + execution replay |
| `franken-critique` | Self-critique evaluators (including reflection) |
| `franken-governor` | Human-in-the-loop governance |
| `franken-web` | Dashboard (simple/advanced) |
| `franken-orchestrator` | Beast Loop, CLI, providers, skills, security |

### 3. Key Concepts (one paragraph each)

- **Provider Registry** — Multi-LLM failover with brain state handoff
- **SqliteBrain** — Three memory types, serialize/hydrate for cross-provider handoff
- **SkillManager** — MCP-based skills, marketplace discovery, per-provider translation
- **Security Profiles** — strict/standard/permissive via `LlmMiddleware` chain
- **Beast Loop** — Four phases: ingestion → planning → execution → closure

### 4. Quickstart

```bash
# Run an agent (auto-detects provider from installed CLIs)
frankenbeast run "fix the login bug"

# Configure providers
frankenbeast provider add claude
frankenbeast provider add openai

# Install skills
frankenbeast skill catalog
frankenbeast skill add github

# Launch dashboard
frankenbeast dashboard
```

### 5. Build & Test

```bash
npm run build          # turbo run build
npm test               # turbo run test
npm run typecheck       # turbo run typecheck
npx turbo run test --filter=franken-brain  # single package
```

### 6. Key Files

- `packages/franken-orchestrator/src/beasts/beast-loop.ts` — main execution loop
- `packages/franken-orchestrator/src/beasts/dep-factory.ts` — dependency wiring
- `packages/franken-brain/src/sqlite-brain.ts` — memory implementation
- `packages/franken-orchestrator/src/providers/provider-registry.ts` — multi-LLM failover
- `packages/franken-orchestrator/src/skills/skill-manager.ts` — MCP skill management

## What to Remove

- All references to `franken-comms`, `franken-mcp`, `franken-skills`, `franken-heartbeat`, `frankenfirewall`
- Old brain architecture descriptions (multiple brain packages)
- Any "known limitations" that were resolved by the consolidation
- References to the old 13-package layout

## Files

- **Modify:** `docs/RAMP_UP.md` — full rewrite

## Exit Criteria

- Under 5000 tokens
- 8-package layout only (no deleted package references)
- Provider configuration quickstart included
- Key concepts are accurate to post-consolidation architecture
- Key files section points to correct paths
- Build commands are current
