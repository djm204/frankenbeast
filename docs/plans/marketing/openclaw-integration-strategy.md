# OpenClaw Integration Strategy

## Context

OpenClaw is the most-starred software project on GitHub (335k+ stars as of March 2026), overtaking React. It's an open-source personal AI assistant with native MCP support, multi-channel messaging (WhatsApp, Telegram, Slack, Discord, etc.), a mature skills/SOUL.md personality system, and a thriving fork ecosystem.

Multiple forks already attempt to add what Frankenbeast has natively:
- **TinkerClaw** — instruction-level guardrails, command classification (SAFE/WARN/CRIT)
- **DevClaw** — deterministic multi-project pipeline orchestration
- **NemoClaw** — Nvidia's guardrails integration via Agent Toolkit
- **Claworc** — multi-instance orchestration with isolation

None of these have Frankenbeast's full stack: DAG planning, critique loops, HITL governance, multi-provider failover with brain state handoff, append-only audit trails, and security middleware.

## Decision: Don't Fork, Integrate

### Why Not Fork

| Factor | Impact |
|--------|--------|
| **Weekly rebase tax** | OpenClaw ships weekly. TinkerClaw is 262 commits ahead — that's permanent drift to manage |
| **Paradigm mismatch** | OpenClaw is chat-first, single-user. Frankenbeast is plan-first, multi-phase, guardrailed. Bolting DAGs onto a chat framework means fighting the grain |
| **Wasted work** | 272+ PRs, 11 packages, 3600+ tests. A fork restarts the integration story |
| **Diluted value prop** | "Personal assistant with guardrails" is weaker than "Deterministic guardrails framework for AI agents" |
| **Distribution without differentiation** | We'd gain OpenClaw's channels but lose our identity in the fork noise |

### Why Integrate via MCP

Frankenbeast's SkillManager and ProviderSkillTranslator already speak MCP. Publishing Frankenbeast as an MCP server lets OpenClaw users install guardrailed execution as a skill — without us maintaining a fork.

This gives us:
- **OpenClaw's 335k-user distribution** as an install target
- **Zero fork maintenance** — we ship our own releases on our own cadence
- **Clear value prop** — "Add deterministic guardrails to your OpenClaw agent"
- **Compatibility with all OpenClaw forks** — TinkerClaw, DevClaw users can also install

## Go-to-Market: Three Distribution Channels

### Channel 1: Standalone CLI (Primary)

**Target:** Teams building AI-powered development pipelines, CI/CD automation, autonomous coding agents.

**Message:** "Deterministic guardrails for AI agents. Plan, critique, govern, execute, audit — every step verified."

**Distribution:**
- npm package (`frankenbeast`)
- GitHub releases
- Docker image
- Documentation site

**Differentiator vs OpenClaw:** OpenClaw helps you chat with AI. Frankenbeast helps you trust AI to execute unsupervised.

### Channel 2: OpenClaw MCP Skill (Growth)

**Target:** OpenClaw power users who want guardrailed execution for coding tasks, multi-step plans, and autonomous operations.

**Product:** `frankenbeast-mcp-server` — an MCP server that exposes Frankenbeast's beast loop as tools:

| Tool | Description |
|------|-------------|
| `frankenbeast_plan` | Create a DAG execution plan from a natural language objective |
| `frankenbeast_execute` | Run a plan through the full guardrailed pipeline (critique, govern, execute, audit) |
| `frankenbeast_audit` | Query the audit trail for a given run |
| `frankenbeast_status` | Check budget, provider health, security profile |

**Installation:**
```json
{
  "mcpServers": {
    "frankenbeast": {
      "command": "npx",
      "args": ["frankenbeast-mcp-server"],
      "env": { "FRANKENBEAST_PROJECT_ROOT": "." }
    }
  }
}
```

**ClawhHub listing:** Submit to OpenClaw's skill directory for discoverability.

**Message:** "Add enterprise-grade guardrails to OpenClaw. Deterministic execution, audit trails, HITL governance — one `mcp.json` away."

### Channel 3: Dashboard Web App (Visibility)

**Target:** Team leads and security-conscious orgs who need visibility into what AI agents are doing.

**Product:** `franken-web` dashboard — already built (React, Zustand, Radix UI, SSE streaming).

**Capabilities already implemented:**
- Real-time agent monitoring via SSE
- Skill management (enable/disable/install)
- Security profile configuration
- Provider health and failover status
- Audit trail viewer

**Distribution:** Bundled with the CLI (`frankenbeast chat-server`), available at `localhost:3737`.

## Competitive Positioning

```
                    Guardrails Depth
                         ^
                         |
          Frankenbeast   |   NemoClaw
          (full stack)   |   (Nvidia guardrails)
                         |
         ----------------+-----------------> Distribution
                         |
          TinkerClaw     |   OpenClaw
          (command-level)|   (no guardrails)
                         |
          DevClaw        |
          (pipeline only)|
```

**Our quadrant:** Deep guardrails, growing distribution. The MCP skill strategy moves us right (more distribution) without moving us down (diluting guardrails).

## Implementation Roadmap

### Phase 1: Ship Frankenbeast 1.0 (Current)

- [x] Architecture Consolidation (ADR-031) — 13 to 8 packages
- [x] Last-mile wiring — all components active in production
- [ ] Resolve remaining Important-level gaps (I2-I6)
- [ ] Update PROGRESS.md, ARCHITECTURE.md, RAMP_UP.md
- [ ] Tag v1.0.0

### Phase 2: Build frankenbeast-mcp-server

- [ ] Create `packages/frankenbeast-mcp-server/`
- [ ] Implement MCP tool handlers wrapping BeastLoop
- [ ] Write SOUL.md / context.md for ClawhHub listing
- [ ] Publish to npm
- [ ] Submit to ClawhHub skill directory
- [ ] Write "Add Frankenbeast to OpenClaw" guide

### Phase 3: Community and Content

- [ ] Blog post: "Why We Didn't Fork OpenClaw (And What We Did Instead)"
- [ ] Blog post: "Deterministic AI Execution: What OpenClaw's Fork Ecosystem Gets Wrong"
- [ ] DEV.to tutorial: "Add Audit Trails to Your OpenClaw Agent in 5 Minutes"
- [ ] Submit to awesome-openclaw-skills directory
- [ ] Demo video: Frankenbeast guardrails catching a bad plan before execution

## Metrics

| Metric | Target (90 days post-launch) |
|--------|------------------------------|
| npm weekly downloads (CLI) | 500 |
| npm weekly downloads (MCP server) | 1,000 |
| GitHub stars | 200 |
| ClawhHub installs | 500 |
| Blog post views | 5,000 |

The MCP server should outpace the CLI in downloads because it rides OpenClaw's existing user base — people install skills more casually than they adopt new CLIs.

## Key Risks

| Risk | Mitigation |
|------|-----------|
| OpenClaw changes MCP protocol | MCP is standardized by Anthropic, not OpenClaw. Low risk. |
| A fork (TinkerClaw/DevClaw) adds equivalent guardrails | Our stack is deeper (7 modules vs command-level). Focus on audit + governance as differentiators. |
| Users want "all-in-one" not "composable" | Dashboard + CLI cover standalone use. MCP skill covers integration. Both paths available. |
| Low adoption of MCP skill | Content marketing (blog, video, tutorial) drives awareness. ClawhHub listing provides passive discovery. |
