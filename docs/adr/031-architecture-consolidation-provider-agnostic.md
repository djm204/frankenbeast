# ADR-031: Architecture Consolidation — Provider-Agnostic Agent Framework

- **Date:** 2026-03-18
- **Status:** Accepted
- **Deciders:** pfk
- **Supersedes:** Portions of ADR-011 (monorepo structure)

## Context

Frankenbeast was designed as a 13-package monorepo providing comprehensive guardrails for AI agents. After evaluating the competitive landscape — particularly OpenClaw (247k GitHub stars) and NVIDIA's NemoClaw wrapper — it became clear that 7 of 13 packages duplicate capabilities that well-funded open-source projects already provide with more contributors and production hours.

Frankenbeast's remaining value lies in areas where existing solutions take different approaches or leave gaps:

1. **Deterministic DAG planning** with dependency resolution and topological sort — LangGraph has graph-based workflows and CrewAI has task delegation, but neither produces a dependency-resolved DAG with critical path analysis before execution begins. They're execution graphs, not planning graphs.
2. **Self-critique loops** with configurable evaluator chains and severity scoring — LangGraph supports reflection patterns and AutoGen has nested evaluation, but Frankenbeast's critique is iterative with pluggable severity-scored evaluators that compose into chains. The difference is granularity: pass/fail vs. scored multi-evaluator feedback loops.
3. **HITL governance** with formal trigger-based approval workflows — Most frameworks offer basic human confirmation hooks (OpenClaw's `HumanConfirmation`, LangGraph's interrupt nodes). Frankenbeast's governor has configurable triggers (budget, skill, custom) with severity-based escalation policies. Whether this extra formality is needed depends on the use case — regulated industries care, indie devs don't.
4. **Provider-agnostic portable memory** that survives LLM provider switches mid-task — LiteLLM handles provider abstraction for API calls, but no existing tool serializes full agent memory (working context + episodic learning + execution checkpoint) into a portable format that can hydrate into a different provider mid-task. This is genuinely novel, though it's also unproven.
5. **Deterministic audit trails** with execution replay — LangSmith and Arize Phoenix provide excellent observability, but as external services. Frankenbeast's observer produces self-contained, replayable execution logs that live with the project. The trade-off is less polish for more portability.

None of these are unique concepts. The bet is that combining them in a single opinionated framework — focused on auditability and provider independence — serves a niche that general-purpose frameworks aren't optimized for.

The strategic decision is to cut the redundant packages, absorb infrastructure concerns into the orchestrator, and sharpen the product around these areas.

### Competitive Landscape (honest assessment)

| Capability | Frankenbeast | Closest Alternatives |
|-----------|-------------|---------------------|
| DAG task planning | `franken-planner` — dependency graph with topo sort and critical path | LangGraph (graph workflows), CrewAI (task delegation) — execution-oriented, not planning-oriented |
| Self-critique | `franken-critique` — iterative evaluator chains with severity scoring | LangGraph reflection, AutoGen nested chat — similar concepts, different composability model |
| HITL governance | `franken-governor` — trigger-based escalation with formal approval | OpenClaw HumanConfirmation, LangGraph interrupt — simpler but cover most use cases |
| Provider failover + memory handoff | `ProviderRegistry` + `BrainSnapshot` serialize/hydrate | LiteLLM (provider abstraction only, no memory portability), no direct equivalent for full state handoff |
| Audit trail + replay | `franken-observer` — self-contained replayable logs | LangSmith, Arize Phoenix — more polished but SaaS/external |
| Skill loading | Marketplace-first MCP aggregation across providers + optional context stuffing, dashboard management UI | OpenClaw AgentSkills (100+ built-in), most frameworks just pass tool schemas — none aggregate across provider marketplaces |
| Memory | SQLite with working/episodic/recovery types | Mem0, LangChain memory, provider-native (claude-mem) — all provider-coupled or general-purpose |

**What Frankenbeast is NOT:**
- Not the most feature-rich (OpenClaw wins)
- Not the most popular (not even close)
- Not the easiest to get started with (single-provider frameworks win)

**What Frankenbeast IS:**
- An opinionated framework for teams that need auditable, provider-independent agent orchestration with formal planning and critique — and are willing to trade ecosystem breadth for control depth.

## Decision

### Packages Retained (8)

| Package | Role | Changes |
|---------|------|---------|
| `franken-types` | Shared interfaces, branded types, Zod schemas | Add `ILlmProvider`, `IBrain`, `BrainSnapshot` |
| `franken-brain` | Provider-agnostic portable memory | **Rewrite.** Three memory types (working, episodic, recovery) backed by SQLite. `serialize()`/`hydrate()` for cross-provider handoff. ~300 lines. |
| `franken-planner` | DAG task decomposition, topo sort, critical path | No changes. |
| `franken-critique` | Self-critique loops + evaluator chains | **Absorbs** reflection from `franken-heartbeat`. Reflection becomes a critique evaluator. |
| `franken-governor` | HITL gates, trigger escalation, approval workflows | No v1 changes. Reusing `franken-critique` severity scoring is a future option after the consolidated runtime stabilizes. |
| `franken-observer` | Deterministic audit trail, execution replay | **Reframed** from general telemetry to provable execution audit. |
| `franken-orchestrator` | Beast Loop, process supervisor, provider registry | **Absorbs** firewall (as LLM middleware), checkpointing (from heartbeat), MCP client (from franken-mcp), skill loading (from franken-skills), comms (from franken-comms — Slack/Discord/Telegram/WhatsApp bidirectional). Adds provider registry with failover. |
| `franken-web` | React dashboard + skill management | **Adds** skill management panel: browse provider catalogs, install/toggle skills, create custom MCPs, edit context.md. Standalone, talks to orchestrator via REST/SSE. |

### Packages Removed (5)

| Package | Disposition |
|---------|-------------|
| `frankenfirewall` | Absorbed into orchestrator as LLM middleware (input validation + output filtering). 2-3 functions, not a package. |
| `franken-skills` | Replaced by marketplace-first MCP skill discovery + directory-based `mcp.json` configs. Provider adapters query native marketplaces; users can also add custom MCP servers. Optional `context.md` for team-specific conventions. |
| `franken-mcp` | Gone. Orchestrator connects to MCP servers as a client via `@modelcontextprotocol/sdk`. No custom MCP server hosting. |
| `franken-heartbeat` | Split. Reflection → critique evaluator. Checkpointing → orchestrator. Periodic self-assessment → orchestrator config flag. |
| `franken-comms` | Absorbed into orchestrator. Slack/Discord/Telegram/WhatsApp adapters, ChatGateway, session mapping, signature verification all move to `orchestrator/src/comms/`. Bidirectional comms preserved. **ChatSocketBridge replaced with direct in-process ChatRuntime integration** — eliminates the localhost WebSocket hop between comms and chat (see Comms Absorption below). |

### Provider-Agnostic LLM Integration

The orchestrator includes a `ProviderRegistry` with adapters for both CLI tools and direct APIs:

**CLI adapters** (~100 lines each):
- Claude CLI — spawns `claude` with `--print`, `--output-format stream-json`
- Codex CLI — spawns `codex` with `--full-context`
- Gemini CLI — spawns `gemini` with context via GEMINI.md

**API adapters** (~80 lines each):
- Anthropic API via `@anthropic-ai/sdk`
- OpenAI API via `openai`
- Gemini API via `@google/genai`

All implement `ILlmProvider`:

```typescript
interface ILlmProvider {
  readonly name: string;
  readonly capabilities: ProviderCapabilities;
  execute(request: LlmRequest): AsyncIterable<LlmStreamEvent>;
  isAvailable(): Promise<boolean>;
  formatHandoff(snapshot: BrainSnapshot): string;
  discoverSkills?(): Promise<SkillCatalogEntry[]>;
}
```

The `formatHandoff()` method is key — each provider receives brain state differently (system prompt, context files, stdin), and the adapter handles the translation.

### Cross-Provider Memory Handoff

When a provider fails (rate limit, error, cost threshold), the orchestrator:

1. Calls `brain.serialize()` → `BrainSnapshot` (JSON)
2. Selects next provider from the registry
3. Calls `provider.formatHandoff(snapshot)` to inject context
4. Resumes execution from the last checkpoint

The `BrainSnapshot` format:

```typescript
interface BrainSnapshot {
  version: 1;
  timestamp: string;
  working: Record<string, unknown>;
  episodic: EpisodicEvent[];
  checkpoint: ExecutionState | null;
  metadata: {
    lastProvider: string;
    switchReason: string;
    totalTokensUsed: number;
  };
}
```

### Skill Loading: Marketplace-First MCP + Context Stuffing

Skills leverage each provider's existing MCP ecosystem. The orchestrator queries provider marketplaces for available skills, installs them as directory-based configs, and translates to provider-specific formats at spawn time.

#### Skill Directory Convention

```
skills/
├── github/               # installed from provider marketplace
│   └── mcp.json          # MCP server connection config (auto-generated or hand-written)
├── linear/
│   └── mcp.json
├── code-review/           # custom skill with team-specific context
│   ├── mcp.json
│   └── context.md         # optional — teaches the LLM team conventions for this tool
```

Skills are toggled via the run config:

```yaml
skills:
  - github
  - code-review
  # - linear         # commented out = disabled
```

#### Marketplace Discovery

Each provider adapter optionally implements `discoverSkills()` to query available marketplace skills:

- **Claude**: query marketplace/registry for available MCP servers
- **Codex**: `codex mcp list` or API equivalent
- **Gemini**: query available extensions

Falls back to "Custom MCP only" if a provider doesn't expose a discovery API.

#### Per-Provider MCP Translation

The orchestrator stores skills in a provider-neutral format (`mcp.json`). At spawn time, each adapter translates to its native config mechanism:

| Provider | MCP Config Mechanism | System Prompt Injection | Output Format |
|----------|---------------------|------------------------|---------------|
| Claude CLI | `--mcp-config <file>` (merged JSON) | `--append-system-prompt` | `--output-format stream-json` |
| Codex CLI | `codex mcp add` per server / config file | Config file or `-c` override | `--json` (NDJSON) |
| Gemini CLI | `settings.json` or project-level config | `GEMINI.md` file | `--output-format stream-json` |

#### Authentication

Skills support dual auth per provider and per MCP server:

- **API key**: stored in `.frankenbeast/.env` (gitignored), injected as env vars at spawn time. MCP servers receive credentials via `env` field in `mcp.json`.
- **CLI login**: user has already authenticated via provider CLI (`claude login`, `codex login`, `gemini login`). No credentials stored — `isAvailable()` verifies auth state.
- **MCP OAuth**: Codex supports `codex mcp login <name>` for OAuth-enabled MCP servers.

#### Dashboard Skill Management

The `franken-web` dashboard provides a visual skill management UI:

- **Browse**: tabbed view per provider showing available marketplace skills (fetched live via `discoverSkills()`)
- **Install**: select a marketplace skill → auto-generates `mcp.json` from provider metadata, prompts for auth
- **Custom MCP**: manual form for user-defined MCP servers (command, args, env vars)
- **Toggle**: all installed skills appear as on/off cards
- **Context editor**: optional `context.md` editor per skill for team-specific guidance
- **Status**: shows MCP server connection health (connected/error)

API routes:
- `GET /api/skills` — list installed skills with enabled/disabled state
- `GET /api/skills/catalog/:provider` — browse provider marketplace
- `POST /api/skills` — install from catalog or create custom MCP
- `PATCH /api/skills/:name` — toggle enable/disable
- `DELETE /api/skills/:name` — remove skill

#### Two-Layer Context Model

Most marketplace skills work with just their MCP tool schemas — the LLM knows how to use GitHub, Slack, etc. from training data. For domain-specific needs (e.g., "always create Linear tickets in project X"), add a `context.md` that gets appended to the system prompt via the provider's injection mechanism.

### Comms Absorption — Direct ChatRuntime Integration

When `franken-comms` is absorbed into the orchestrator, the `ChatSocketBridge` WebSocket client is replaced with direct in-process calls to `ChatRuntime.run()`. Previously, comms ran as a separate process and connected to the chat server via `ws://localhost:3737/v1/chat/ws`. After absorption, both live in the same process — the network hop is unnecessary.

**Before (separate processes):**
```
Slack webhook → ChatGateway → ChatSocketBridge → ws://localhost:3737 → ChatRuntime
```

**After (single process):**
```
Slack webhook → ChatGateway → ChatRuntime.run() (direct call)
```

**Security improvement:** This eliminates a localhost attack surface:
- **No open WebSocket port** — the `ws://localhost:3737` connection was unencrypted local traffic that any process on the machine could connect to or intercept. Now it's an in-process function call with no network surface.
- **No token auth to misconfigure** — `ChatSocketBridge` used session tokens for WebSocket authentication. One less auth mechanism to leak or bypass.
- **No replay window** — WebSocket messages between comms and chat could be captured and replayed by local processes. In-process calls have no wire format to replay.
- **Single trust boundary** — webhook signature verification on platform endpoints becomes the only external-facing surface to reason about and enforce.

Additionally, the comms subsystem integrates with the consolidated architecture:
- **Provider-aware outbound messages** — channel replies carry provider name and execution phase, formatted per platform (Slack blocks, Discord embeds, Telegram MarkdownV2, WhatsApp plain text)
- **Security profile integration** — webhook signature verification respects the configurable security profiles (`strict`/`standard` = mandatory, `permissive` = optional)
- **Run-config v2** — `comms` section added to the consolidated run config schema for channel enable/disable and secret references

### Configurable Security

Security is first-class but configurable based on needs. Three built-in profiles:

- **`strict`**: All guards on, domain allowlist required, all actions need HITL approval. For regulated/enterprise environments.
- **`standard`** (default): Injection detection + PII masking on, destructive actions need approval. Sensible defaults.
- **`permissive`**: Minimal friction, output validation only. For solo dev / trusted environments.

Individual settings (injection detection, PII masking, output validation, domain allowlist, token budget, HITL level) can be overridden per-profile. Configurable via dashboard, CLI (`frankenbeast security set strict`), or run config (`security: { profile: standard }`).

### Dashboard: Simple and Advanced Modes

The dashboard has two modes, toggled via a persistent switch:

- **Simple mode** (default): Best-practice defaults pre-selected, minimal configuration needed. Run agents, toggle skills on/off, see provider status, pick security profile. Zero learning curve.
- **Advanced mode**: Granular fine-tuning — custom MCP servers, per-skill context editing, provider failover ordering, individual security setting overrides, token budgets, domain allowlists.

Four panels: **Agents**, **Skills**, **Providers**, **Security**. Design principle: if it needs a tutorial, it's too complex.

### Extensibility (Future)

The platform should be easily extendable, either through forking or a secure plugin system. Not needed for the initial MVP — to be designed after v1 stabilizes. Potential directions: plugin hooks for custom middleware, custom evaluators, custom provider adapters.

## Consequences

### Positive

- **13 → 8 packages**: Less surface area, faster builds, simpler onboarding
- **Provider agnostic**: Claude, Codex, and Gemini all work — CLI or API
- **Crash resilient**: Brain serialization survives provider outages mid-task
- **Focused scope**: Every remaining package addresses an area where existing frameworks take a different approach or leave gaps — not unique ideas, but a unique combination and depth of implementation
- **Fewer external deps**: `zod`, `better-sqlite3`, `@modelcontextprotocol/sdk`, `hono`, plus LLM SDKs
- **Low friction**: Simple mode dashboard + intuitive CLI means zero-config onboarding for basic use cases
- **Comms security hardened**: Replacing the localhost WebSocket bridge with in-process ChatRuntime calls eliminates an unencrypted local network surface, token auth surface, and message replay window

### Negative

- **Migration cost**: Existing tests and imports for removed packages need cleanup
- **Brain rewrite**: Current franken-brain is overengineered; new version is a ground-up rewrite
- **Skill discovery API stability**: Provider marketplace APIs may change or be undocumented — `discoverSkills()` may need maintenance per provider
- **Provider adapter maintenance**: Each LLM CLI may change flags/output format across versions

### Risks

- **Market risk**: The niche of "auditable, provider-agnostic agent orchestration" may not be large enough to sustain a project. Most teams may prefer OpenClaw + LangSmith and accept the trade-offs.
- **Convergence risk**: LangGraph, CrewAI, or OpenClaw could add DAG planning, iterative critique, or provider failover at any time. These are ideas, not patents.
- **Solo maintainer risk**: A framework this ambitious with one contributor is fragile. Community adoption or a co-maintainer is needed for longevity.
- Provider CLI output formats are not stable APIs — adapters may break on updates
- SQLite portable memory has no encryption at rest (future concern for enterprise)
- Marketplace skill discovery depends on provider APIs that may not be stable or publicly documented
- Custom MCP server quality directly determines agent effectiveness — misconfigured servers = broken tools

## Dependencies

| Dependency | Used By | Purpose |
|------------|---------|---------|
| `zod` | types, orchestrator | Schema validation |
| `better-sqlite3` | brain | All three memory types in one file |
| `@modelcontextprotocol/sdk` | orchestrator | MCP tool discovery + execution |
| `hono` | orchestrator | HTTP/SSE server |
| `@anthropic-ai/sdk` | orchestrator | Claude API adapter |
| `openai` | orchestrator | OpenAI/Codex API adapter |
| `@google/genai` | orchestrator | Gemini API adapter |
| `react`, `zustand` | web | Dashboard UI |

## Dependency Graph

```
franken-types (leaf — no internal deps)
    ↑
    ├── franken-planner
    ├── franken-critique
    ├── franken-observer
    ├── franken-brain
    │
    ├── franken-governor
    │
    └── franken-orchestrator
            ↑ uses ALL of the above
            ↑ + @modelcontextprotocol/sdk
            ↑ + better-sqlite3 (via brain)
            ↑ + hono (HTTP server)
            ↑ + LLM SDKs

franken-web (standalone, REST/SSE client)
```
