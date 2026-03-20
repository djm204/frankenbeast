# Architecture Consolidation — Implementation Plan

**Date:** 2026-03-18
**Status:** Draft
**ADR:** [031-architecture-consolidation-provider-agnostic](../adr/031-architecture-consolidation-provider-agnostic.md)
**Branch:** `feat/architecture-consolidation` (from `main`, after merging current Plan 1 work)

---

## Overview

Cut Frankenbeast from 13 packages to 8. Remove redundant packages, absorb infrastructure into the orchestrator, rewrite franken-brain for portable cross-provider memory, add provider registry with CLI + API adapters, and implement skill loading via MCP + context stuffing.

**Execution order:** Phases are sequential. Within each phase, chunks can run in parallel where noted.

---

## Phase 0: Stabilize Current Branch

**Goal:** Merge `feat/plan1-execution-pipeline` cleanly before starting consolidation.

### 0.1 — Fix remaining Plan 1 issues

- Fix `agent-failure-flow.test.ts` (DISCREPANCIES 5.5) — `lastStderrLines` not populated in `attempt.failed` payload
- All Plan 1 tests green
- Merge PR #241 to `main`

### 0.2 — Tag the pre-consolidation state

```bash
git tag v0.pre-consolidation  # escape hatch if consolidation goes sideways
```

**Exit criteria:** `main` is green, tagged, Plan 1 merged.

---

## Phase 1: Remove Dead Packages

**Goal:** Delete 4 packages that are being replaced by new components, absorb 1 package (franken-comms) into the orchestrator. Fix all broken imports. Tests pass with fewer packages.

Mostly subtraction, with one absorption (comms → orchestrator).

### 1.1 — Absorb `franken-comms` into orchestrator

- Move `packages/franken-comms/src/` → `packages/franken-orchestrator/src/comms/` (preserving directory structure)
- Move `packages/franken-comms/tests/` → `packages/franken-orchestrator/tests/unit/comms/`
- Merge Hono webhook routes into orchestrator's existing server (`comms-routes.ts`)
- Update all imports from `@frankenbeast/comms` to relative `../comms/` paths
- Add `ws` dependency to orchestrator's `package.json`
- Delete `packages/franken-comms/` directory
- Remove from root `package.json` workspaces, `turbo.json`, `tsconfig.json`
- Slack/Discord/Telegram/WhatsApp bidirectional comms preserved — ChatGateway, channel adapters, signature verification, session mapping, HITL approval via Slack buttons all survive

### 1.2 — Remove `franken-mcp`

- Delete `packages/franken-mcp/`
- Remove workspace/turbo/tsconfig references
- Grep for `@frankenbeast/mcp` — the orchestrator's `dep-factory.ts` has an MCP module toggle. Remove the dynamic import, leave a `// TODO: replace with @modelcontextprotocol/sdk` comment.

### 1.3 — Remove `franken-skills`

- Delete `packages/franken-skills/`
- Remove workspace/turbo/tsconfig references
- Grep for `@frankenbeast/skills` — orchestrator's `dep-factory.ts` dynamically imports this. Remove, leave TODO.
- The `filteredSkills` logic in `dep-factory.ts` stays — it will be rewired to the new skill loader later.

### 1.4 — Remove `franken-heartbeat`

- Delete `packages/franken-heartbeat/`
- Remove workspace/turbo/tsconfig references
- Grep for `@frankenbeast/heartbeat` — orchestrator's closure phase calls heartbeat. Replace with no-op for now.

### 1.5 — Remove `frankenfirewall`

- Delete `packages/frankenfirewall/`
- Remove workspace/turbo/tsconfig references
- Grep for `@frankenbeast/firewall` — orchestrator's ingestion phase and `dep-factory.ts` reference this. Replace with pass-through no-op.

### 1.6 — Fix all tests

- Run full `npm test` — fix every broken import and reference
- Run `npm run typecheck` — clean
- Run `npm run build` — clean
- Update `.gitignore` if needed

**Exit criteria:** 8 packages remain. All tests pass. Build succeeds. No references to deleted packages. Comms functionality (Slack/Discord/Telegram/WhatsApp) preserved in orchestrator.

**Parallelism:** Chunks 1.1–1.5 can run in parallel (independent operations). 1.6 runs after all.

---

## Phase 2: Rewrite `franken-brain` — Portable Memory

**Goal:** Replace the overengineered brain with a ~300-line SQLite-backed implementation that supports serialize/hydrate for cross-provider handoff.

### 2.1 — Define interfaces in `franken-types`

```typescript
// New types in @frankenbeast/types
interface IBrain {
  working: IWorkingMemory;
  episodic: IEpisodicMemory;
  recovery: IRecoveryMemory;
  serialize(): BrainSnapshot;
}

interface IWorkingMemory {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  snapshot(): Record<string, unknown>;
  restore(snapshot: Record<string, unknown>): void;
}

interface IEpisodicMemory {
  record(event: EpisodicEvent): void;
  recall(query: string, limit?: number): EpisodicEvent[];
  recentFailures(n?: number): EpisodicEvent[];
}

interface IRecoveryMemory {
  checkpoint(state: ExecutionState): void;
  lastCheckpoint(): ExecutionState | null;
}

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

**Files:**
- Modify: `packages/franken-types/src/brain.ts` (or new file)
- Test: Type-level tests, Zod schema for `BrainSnapshot`

### 2.2 — Implement `SqliteBrain`

- Working memory: in-memory `Map`, flushed to SQLite `working_memory` table on checkpoint
- Episodic memory: SQLite `episodic_events` table with structured columns (type, step, summary, timestamp, embedding)
- Recovery: SQLite `checkpoints` table, JSON blob of execution state
- `serialize()`: reads all three stores into a `BrainSnapshot` JSON
- `hydrate(snapshot)`: static factory that creates a new `SqliteBrain` from a snapshot

**Files:**
- Rewrite: `packages/franken-brain/src/sqlite-brain.ts`
- Test: `packages/franken-brain/tests/unit/sqlite-brain.test.ts`
- Test: `packages/franken-brain/tests/integration/brain-serialize-hydrate.test.ts`

### 2.3 — Semantic recall (episodic search)

- For v1: keyword/recency-based recall (no embeddings). `recall(query)` does SQLite `LIKE` + recency scoring.
- Embeddings column exists in schema but is nullable — future enhancement.
- This keeps `better-sqlite3` as the only dependency (no vector DB).

**Files:**
- Part of `sqlite-brain.ts`
- Test: `packages/franken-brain/tests/unit/episodic-recall.test.ts`

### 2.4 — Delete old brain code

- Remove all existing brain implementation files that are not part of the new design
- Keep only what's needed: `SqliteBrain`, types, tests
- Update `package.json` — only dependency should be `better-sqlite3` + `@frankenbeast/types`

**Exit criteria:** `franken-brain` is ~300 lines. `serialize()`/`hydrate()` round-trips in tests. Old code gone.

**Parallelism:** 2.1 first, then 2.2–2.4 in parallel.

---

## Phase 3: Provider Registry + Adapters

**Goal:** The orchestrator can execute LLM requests through any configured provider with automatic failover.

### 3.1 — Define provider interfaces in `franken-types`

```typescript
interface ILlmProvider {
  readonly name: string;
  readonly capabilities: ProviderCapabilities;
  execute(request: LlmRequest): AsyncIterable<LlmStreamEvent>;
  isAvailable(): Promise<boolean>;
  formatHandoff(snapshot: BrainSnapshot): string;
  discoverSkills?(): Promise<SkillCatalogEntry[]>;
}

interface ProviderCapabilities {
  streaming: boolean;
  toolUse: boolean;
  vision: boolean;
  maxContextTokens: number;
  mcpSupport: boolean;
  skillDiscovery: boolean;
}

interface SkillCatalogEntry {
  name: string;
  description: string;
  provider: string;
  installConfig: McpServerConfig;
  authFields: { key: string; label: string; type: 'secret' | 'text' }[];
}

interface LlmRequest {
  systemPrompt: string;
  messages: LlmMessage[];
  tools?: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
}

type LlmStreamEvent =
  | { type: 'text'; content: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'done'; usage: TokenUsage }
  | { type: 'error'; error: string };
```

**Files:**
- Add: `packages/franken-types/src/provider.ts`

### 3.2 — Implement `ProviderRegistry`

```typescript
class ProviderRegistry {
  constructor(providers: ILlmProvider[], brain: IBrain);

  // Tries providers in order, handles failover
  async *execute(request: LlmRequest): AsyncIterable<LlmStreamEvent>;
}
```

- On provider failure: serialize brain, try next provider with handoff context
- On rate limit: back off, then failover
- On all providers exhausted: checkpoint and throw

**Files:**
- Add: `packages/franken-orchestrator/src/providers/provider-registry.ts`
- Test: `packages/franken-orchestrator/tests/unit/providers/provider-registry.test.ts`

### 3.3 — Claude CLI adapter

**Verified CLI flags** (from https://code.claude.com/docs/en/cli-reference):
- `-p` (print mode, non-interactive)
- `--output-format stream-json` (NDJSON streaming)
- `--mcp-config <file>` (MCP server config JSON)
- `--append-system-prompt <text>` (context injection)
- `--max-budget-usd <n>` (cost limit)
- `--max-turns <n>` (turn limit)
- `--tools "Bash,Read,mcp__github__*"` (tool filtering)

Implementation:
- Spawns `claude -p --output-format stream-json --mcp-config <merged-skills.json>`
- Strips `CLAUDE_CODE_ENTRYPOINT` and other `CLAUDE*` env vars (existing fix)
- Sets `FRANKENBEAST_SPAWNED=1`
- Parses stream-json events → `LlmStreamEvent`
- `formatHandoff()`: injects brain snapshot via `--append-system-prompt`
- `isAvailable()`: checks for `claude` binary + auth (API key or CLI login)
- `discoverSkills()`: queries Claude marketplace for available MCP servers

**Files:**
- Add: `packages/franken-orchestrator/src/providers/claude-cli-adapter.ts`
- Test: `packages/franken-orchestrator/tests/unit/providers/claude-cli-adapter.test.ts`

### 3.4 — Codex CLI adapter

**Verified CLI flags** (from https://developers.openai.com/codex/cli/reference):
- `codex exec` (non-interactive scripted mode)
- `--json` / `--experimental-json` (NDJSON streaming)
- `codex mcp add <name>` (MCP server management)
- `codex mcp list --json` (list configured servers)
- `codex mcp login <name> --scopes <s>` (OAuth for MCP servers)
- `--env KEY=VALUE` (env vars for MCP stdio servers)
- `-p <profile>` / `-c key=value` (config overrides)
- `--output-last-message <path>` (capture final response)
- `--ephemeral` (skip session persistence)

Implementation:
- Spawns `codex exec --json` with skills pre-configured via `codex mcp add`
- Parses NDJSON output → `LlmStreamEvent`
- `formatHandoff()`: injects brain snapshot via config overrides or stdin
- `isAvailable()`: checks for `codex` binary + auth (API key or CLI login)
- `discoverSkills()`: parses `codex mcp list --json` for available servers

**Files:**
- Add: `packages/franken-orchestrator/src/providers/codex-cli-adapter.ts`
- Test: `packages/franken-orchestrator/tests/unit/providers/codex-cli-adapter.test.ts`

### 3.5 — Gemini CLI adapter

**Verified CLI flags** (from https://github.com/google-gemini/gemini-cli):
- `-p` (non-interactive mode)
- `--output-format stream-json` (NDJSON streaming)
- `--output-format json` (complete JSON response)
- `-m <model>` (model selection, e.g., `gemini-2.5-flash`)
- `--include-directories <dirs>` (scope control)
- `GEMINI.md` (project-level context injection)
- `~/.gemini/settings.json` (MCP server configuration)
- `@servername` syntax in prompts for MCP tool invocation

Implementation:
- Spawns `gemini -p --output-format stream-json`
- Writes/updates `GEMINI.md` for context injection (handoff + skill context)
- Configures MCP servers via `~/.gemini/settings.json` or project-level config
- Parses stream-json events → `LlmStreamEvent`
- `isAvailable()`: checks for `gemini` binary + auth (API key or CLI login)
- `discoverSkills()`: queries Gemini extension registry for available tools

**Files:**
- Add: `packages/franken-orchestrator/src/providers/gemini-cli-adapter.ts`
- Test: `packages/franken-orchestrator/tests/unit/providers/gemini-cli-adapter.test.ts`

### 3.6 — Anthropic API adapter

- Uses `@anthropic-ai/sdk` directly
- Streaming via `client.messages.stream()`
- `formatHandoff()`: brain snapshot as system message
- Fallback when Claude CLI is unavailable

**Files:**
- Add: `packages/franken-orchestrator/src/providers/anthropic-api-adapter.ts`
- Test: `packages/franken-orchestrator/tests/unit/providers/anthropic-api-adapter.test.ts`

### 3.7 — OpenAI API adapter

- Uses `openai` SDK
- Streaming via `client.chat.completions.create({ stream: true })`
- `formatHandoff()`: brain snapshot as system message

**Files:**
- Add: `packages/franken-orchestrator/src/providers/openai-api-adapter.ts`
- Test: `packages/franken-orchestrator/tests/unit/providers/openai-api-adapter.test.ts`

### 3.8 — Gemini API adapter

- Uses `@google/genai` SDK
- `formatHandoff()`: brain snapshot as system instruction

**Files:**
- Add: `packages/franken-orchestrator/src/providers/gemini-api-adapter.ts`
- Test: `packages/franken-orchestrator/tests/unit/providers/gemini-api-adapter.test.ts`

### 3.9 — Provider failover integration test

- Mock three providers: first returns rate limit, second returns error, third succeeds
- Verify brain serialization happens between switches
- Verify the third provider receives the handoff context
- Verify observer audit trail records the provider switches

**Files:**
- Test: `packages/franken-orchestrator/tests/integration/providers/provider-failover.test.ts`

**Exit criteria:** `ProviderRegistry` handles failover. At least Claude CLI + Anthropic API adapters work end-to-end. Other adapters have unit tests with mocked CLIs.

**Parallelism:** 3.1 first. Then 3.2 + 3.3–3.8 in parallel. 3.9 after all adapters.

---

## Phase 4: Absorb Firewall into Orchestrator

**Goal:** Input validation and output filtering live as middleware in the orchestrator, not a separate package.

### 4.1 — Extract core firewall logic

- Review existing `frankenfirewall` (already deleted in Phase 1) — pull the useful validation logic from git history
- Injection detection patterns
- PII masking rules
- Output validation

### 4.2 — Implement as orchestrator middleware

```typescript
// packages/franken-orchestrator/src/middleware/llm-middleware.ts
interface LlmMiddleware {
  beforeRequest(request: LlmRequest): LlmRequest;  // validate/transform input
  afterResponse(response: LlmResponse): LlmResponse;  // validate/filter output
}
```

- `InjectionDetectionMiddleware` — scans prompts for known injection patterns
- `PiiMaskingMiddleware` — redacts sensitive data before sending to LLM
- `OutputValidationMiddleware` — validates response structure

### 4.3 — Configurable security profiles

Security is first-class but not one-size-fits-all. Three built-in profiles, fully configurable via dashboard or run config:

```typescript
// packages/franken-orchestrator/src/middleware/security-profiles.ts
type SecurityProfile = 'strict' | 'standard' | 'permissive';

interface SecurityConfig {
  profile: SecurityProfile;               // base profile
  injectionDetection: boolean;            // prompt injection scanning
  piiMasking: boolean;                    // redact PII before LLM calls
  outputValidation: boolean;              // validate response structure
  allowedDomains?: string[];              // restrict MCP server origins
  maxTokenBudget?: number;                // per-run token ceiling
  requireApproval?: 'all' | 'destructive' | 'none';  // HITL gate level
  customRules?: SecurityRule[];           // user-defined rules
}
```

**Built-in profiles:**

| Setting | `strict` | `standard` | `permissive` |
|---------|----------|------------|--------------|
| Injection detection | On | On | Off |
| PII masking | On | On | Off |
| Output validation | On | On | On |
| Domain allowlist | Required | Optional | Off |
| Token budget | Enforced | Enforced | Optional |
| HITL approval | All actions | Destructive only | None |

- **`strict`**: enterprise/compliance use cases — all guards on, domain allowlist required, all actions need approval
- **`standard`** (default): sensible defaults — injection + PII protection on, destructive actions need approval
- **`permissive`**: solo dev / trusted environment — minimal friction, output validation only

Run config:
```yaml
security:
  profile: standard
  # Override individual settings:
  piiMasking: false
  requireApproval: none
```

Dashboard: Security panel shows current profile as a selector with toggles for each setting. Changes apply to new runs immediately.

**API routes:**
- `GET /api/security` — current security config
- `PATCH /api/security` — update security profile or individual settings

**Files:**
- Add: `packages/franken-orchestrator/src/middleware/security-profiles.ts`
- Add: `packages/franken-orchestrator/src/middleware/llm-middleware.ts`
- Add: `packages/franken-orchestrator/src/middleware/injection-detection.ts`
- Add: `packages/franken-orchestrator/src/middleware/pii-masking.ts`
- Add: `packages/franken-orchestrator/src/http/routes/security-routes.ts`
- Test: `packages/franken-orchestrator/tests/unit/middleware/`

**Exit criteria:** Middleware chain runs before/after every LLM call. Security profiles configurable from dashboard and run config. Existing firewall tests migrated or replaced.

---

## Phase 5: Skill Loading — Marketplace-First MCP + Dashboard Management

**Goal:** Skills are marketplace-sourced or custom MCP servers, managed as directory-based configs with optional context, toggleable from run config or dashboard, with per-provider translation at spawn time.

### 5.1 — Define skill directory structure

```
skills/
├── github/               # installed from provider marketplace
│   └── mcp.json          # auto-generated MCP server config
├── linear/
│   └── mcp.json
├── code-review/           # custom skill with team-specific context
│   ├── mcp.json
│   └── context.md         # optional — team conventions for this tool
```

`mcp.json` follows standard MCP config format:
```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "${GITHUB_TOKEN}" }
    }
  }
}
```

**Files:**
- Add: `packages/franken-types/src/skill.ts` (Zod schemas for skill config)
- Test: type-level tests for skill schemas

### 5.2 — Implement `SkillManager`

```typescript
// packages/franken-orchestrator/src/skills/skill-manager.ts
class SkillManager {
  listInstalled(): SkillInfo[];
  install(provider: string, skillName: string): Promise<void>;
  installCustom(name: string, mcpConfig: McpServerConfig): Promise<void>;
  enable(name: string): void;
  disable(name: string): void;
  remove(name: string): void;
  loadForProvider(provider: ILlmProvider, enabledSkills: string[]): ProviderSkillConfig;
}
```

- `listInstalled()`: scans `skills/` directory, returns name + enabled state + has-context flag
- `install()`: calls provider's `discoverSkills()`, writes `mcp.json` from catalog metadata
- `installCustom()`: writes user-provided MCP config to `skills/<name>/mcp.json`
- `loadForProvider()`: translates enabled skills to provider-specific format (see 5.3)

**Files:**
- Add: `packages/franken-orchestrator/src/skills/skill-manager.ts`
- Test: `packages/franken-orchestrator/tests/unit/skills/skill-manager.test.ts`

### 5.3 — Per-provider MCP config translation

Each provider adapter receives skills differently. `loadForProvider()` handles the translation:

- **Claude CLI**: merges all enabled skills' `mcp.json` into one temp file, passed via `--mcp-config <file>`. Context appended via `--append-system-prompt`.
- **Codex CLI**: writes to codex config or runs `codex mcp add` per server. Context via config file or `-c` override.
- **Gemini CLI**: writes to `settings.json` or project-level config. Context via `GEMINI.md` file.

**Files:**
- Add: `packages/franken-orchestrator/src/skills/provider-skill-translator.ts`
- Test: `packages/franken-orchestrator/tests/unit/skills/provider-skill-translator.test.ts`

### 5.4 — Auth management

Dual auth per provider and per MCP server:

- **API key path**: stored in `.frankenbeast/.env` (gitignored). `SkillManager` resolves `${VAR}` placeholders in `mcp.json` from this file + process env. Injected as env vars at process spawn.
- **CLI login path**: no credentials stored. Provider adapter's `isAvailable()` verifies auth state. MCP servers that use the provider's auth (e.g., GitHub via `gh` CLI) inherit the CLI session.
- **MCP OAuth**: for Codex, `codex mcp login <name>` handles OAuth flow. Skill install prompts user for auth method.

**Files:**
- Add: `packages/franken-orchestrator/src/skills/skill-auth.ts`
- Test: `packages/franken-orchestrator/tests/unit/skills/skill-auth.test.ts`

### 5.5 — Provider skill discovery

Each CLI adapter optionally implements `discoverSkills()`:

```typescript
interface SkillCatalogEntry {
  name: string;
  description: string;
  provider: string;
  installConfig: McpServerConfig;  // pre-filled mcp.json template
  authFields: AuthField[];          // what credentials are needed
}
```

- **Claude**: query marketplace API for available MCP servers
- **Codex**: parse `codex mcp list --json` output
- **Gemini**: query extension registry

Falls back to "Custom MCP only" if provider doesn't expose discovery.

**Files:**
- Modify: each CLI adapter in `packages/franken-orchestrator/src/providers/` to add optional `discoverSkills()`
- Test: discovery tests per adapter (mocked responses)

### 5.6 — Skill management API routes

```typescript
// packages/franken-orchestrator/src/http/routes/skill-routes.ts
GET  /api/skills                    // list installed skills with enabled/disabled state
GET  /api/skills/catalog/:provider  // browse provider marketplace (calls discoverSkills())
POST /api/skills                    // install from catalog or create custom MCP
PATCH /api/skills/:name             // toggle enable/disable
DELETE /api/skills/:name            // remove skill directory
```

**Files:**
- Add: `packages/franken-orchestrator/src/http/routes/skill-routes.ts`
- Test: `packages/franken-orchestrator/tests/integration/skills/skill-routes.test.ts`

### 5.7 — Context stuffing integration

When a skill has a `context.md`, append it to the system prompt via the provider's injection mechanism:

- Claude: `--append-system-prompt "$(cat skills/<name>/context.md)"`
- Codex: config file or `-c` override
- Gemini: prepend to `GEMINI.md`

This is the "two-layer" model: most marketplace skills work with just their MCP tool schemas (the LLM knows GitHub, Slack, etc. from training). Context.md is only needed for team-specific conventions.

**Files:**
- Part of `provider-skill-translator.ts` (5.3)
- Test: context injection verified in provider-skill-translator tests

### 5.8 — Migrate existing beast definitions

- Existing beast definitions (`martin-loop-definition`, `chunk-plan-definition`, etc.) become skill directories
- Their `parseArgs` + `configSchema` inform the `mcp.json` structure
- Their usage instructions become `context.md`

**Exit criteria:** Skills install from marketplace or custom. Toggle from run config or API. Per-provider MCP translation works. Auth supports both API keys and CLI login. Dashboard can browse, install, and manage skills.

**Parallelism:** 5.1 first. Then 5.2–5.5 in parallel. 5.6–5.8 after 5.2.

---

## Phase 6: Absorb Reflection into Critique

**Goal:** Heartbeat's reflection capability becomes a critique evaluator.

### 6.1 — Create `ReflectionEvaluator`

```typescript
// packages/franken-critique/src/evaluators/reflection-evaluator.ts
class ReflectionEvaluator implements ICritiqueEvaluator {
  // Uses an LLM to evaluate: "Given what you've done so far, is this the right approach?"
  // Returns severity-scored critique like any other evaluator
  evaluate(context: CritiqueContext): Promise<CritiqueResult>;
}
```

- Wraps the heartbeat reflection logic as a standard evaluator
- Can be added to any critique chain via config
- Orchestrator optionally runs reflection between phases (config flag)

**Files:**
- Add: `packages/franken-critique/src/evaluators/reflection-evaluator.ts`
- Test: `packages/franken-critique/tests/unit/evaluators/reflection-evaluator.test.ts`

**Exit criteria:** Reflection works as a critique evaluator. Can be enabled per-phase via config.

---

## Phase 7: Reframe Observer as Audit Trail

**Goal:** Observer produces deterministic, replayable execution logs suitable for compliance auditing.

### 7.1 — Define audit event schema

- Every observer event gets: `eventId`, `timestamp`, `phase`, `provider`, `inputHash`, `outputHash`
- Events are append-only, immutable
- The full sequence can be replayed to reproduce the execution path

### 7.2 — Add replay capability

```typescript
class ExecutionReplayer {
  // Given an audit trail, reproduce the decision sequence
  replay(events: AuditEvent[]): ExecutionTimeline;
}
```

### 7.3 — Integrate provider switches into audit trail

- When the orchestrator switches providers, observer records: `{ type: 'provider.switch', from, to, reason, brainSnapshotHash }`
- Auditors can see exactly when and why a provider switch happened

**Files:**
- Modify: `packages/franken-observer/src/`
- Test: `packages/franken-observer/tests/`

**Exit criteria:** Every execution produces a complete audit trail. Provider switches are logged. Replay works.

---

## Phase 8: Wire Everything Together

**Goal:** The Beast Loop uses the new provider registry, brain, skill loader, and middleware.

### 8.1 — Update `dep-factory.ts`

- Remove dynamic imports for deleted packages
- Wire `ProviderRegistry`, `SqliteBrain`, `SkillLoader`, `LlmMiddleware`
- Provider config from run config or environment

### 8.2 — Update Beast Loop phases

- **Ingestion**: LLM middleware (was firewall) + brain hydration + skill context assembly
- **Planning**: franken-planner (unchanged) + critique with optional reflection evaluator
- **Execution**: Skills via MCP + tools with context, provider registry for LLM calls
- **Closure**: Observer audit finalization + brain checkpoint + optional reflection

### 8.3 — Update `franken-web` dashboard

Design principle: **if it needs a tutorial, it's too complex.**

**Two dashboard modes:**

- **Simple mode** (default): best-practice defaults enabled, minimal config. Shows what matters — agents running, skills on/off, provider status. One toggle to switch modes.
- **Advanced mode**: granular fine-tuning for every setting. Security rules, custom MCP configs, provider failover ordering, per-skill context editing, token budgets.

A persistent toggle in the top-right switches between modes. User preference is saved (localStorage). Simple mode hides nothing — it just pre-selects sensible defaults and collapses advanced options.

```
┌─────────────────────────────────────────────────────┐
│  Frankenbeast Dashboard       [Simple ◉ │ Advanced] │
├──────────┬──────────┬──────────┬────────────────────┤
│  Agents  │  Skills  │ Providers│  Security          │
├──────────┴──────────┴──────────┴────────────────────┤
│                                                      │
│  [Active panel content here]                         │
│                                                      │
└──────────────────────────────────────────────────────┘
```

#### Simple Mode

**Agents panel:**
- Agent cards with status badge (running/stopped/failed)
- "New Run" button → text input only (uses default provider + all enabled skills)
- Click agent → live logs stream

**Skills panel:**
- Grid of installed skill cards with on/off toggles
- "Add Skill" button → marketplace browser (single list, auto-detects provider)
- That's it. No context editing, no custom MCP, no auth forms (uses CLI login)

**Providers panel:**
- Provider cards with green/red auth status
- "Add" button → detects installed CLIs, one-click add
- No failover ordering (uses auto-detected order)

**Security panel:**
- Three profile cards: Strict / Standard (selected by default) / Permissive
- One click to switch. No individual toggles visible.

#### Advanced Mode

Everything from Simple, plus:

**Agents panel (advanced):**
- "New Run" with provider selector, skill overrides, security profile override
- Run timeline with provider switch events and brain snapshots
- Provider badge on each agent card

**Skills panel (advanced):**
- Each card shows: provider origin, MCP server status (green/red dot), has-context badge
- **"Browse Catalog"** button → tabbed view per provider, fetches from `GET /api/skills/catalog/:provider`
- **Install flow**: click marketplace skill → auth form (API key input or "use CLI login" toggle) → `POST /api/skills`
- **"Add Custom"** button → form for server command, args, env vars → `POST /api/skills`
- Click skill card → inline `context.md` editor for team-specific guidance

**Providers panel (advanced):**
- Drag to reorder failover priority
- Click to configure: API key input field OR "using CLI login" indicator
- Per-provider capability display (streaming, MCP support, skill discovery)

**Security panel (advanced):**
- Profile selector (strict/standard/permissive) as base
- Individual toggle switches for each setting below the profile selector
- "Customized" badge when individual settings differ from selected profile
- Domain allowlist editor
- Token budget input
- HITL approval level selector (`all` / `destructive` / `none`)
- Custom security rules (future: rule builder UI)

**UX principles applied:**
- Simple mode is the default — zero config needed to start
- Advanced mode is one toggle away, not buried
- No nested menus deeper than 2 levels
- Every action reachable in ≤ 2 clicks from the panel
- Sensible defaults pre-filled (standard security, all installed skills enabled, auto-detected provider order)
- Status indicators use color (green/yellow/red) + text (never color alone)
- Error states show what to do, not just what went wrong

### 8.4 — CLI command design

The CLI must be intuitive — no manual reading required for common tasks.

**Core commands:**

```bash
# Run an agent (primary use case — one command)
frankenbeast run "fix the login bug"
frankenbeast run "refactor auth module" --provider claude --skills github,code-review

# Skill management
frankenbeast skill list                    # show installed skills + enabled/disabled
frankenbeast skill catalog                 # browse all providers' marketplace skills
frankenbeast skill catalog claude          # browse one provider's marketplace
frankenbeast skill add github              # install from marketplace (auto-detects provider)
frankenbeast skill add --custom my-tool    # interactive: prompts for command, args, env
frankenbeast skill enable linear           # toggle on
frankenbeast skill disable linear          # toggle off
frankenbeast skill remove linear           # delete skill directory

# Provider management
frankenbeast provider list                 # show configured providers + auth status
frankenbeast provider add claude           # interactive: API key or "use CLI login"
frankenbeast provider order claude codex gemini  # set failover priority

# Security
frankenbeast security status               # show current profile + settings
frankenbeast security set strict           # switch profile
frankenbeast security set --pii-masking off  # override individual setting

# Dashboard
frankenbeast dashboard                     # start dashboard (opens browser)
```

**Design principles:**
- **Verb-noun pattern**: `frankenbeast <noun> <verb>` (e.g., `skill add`, `provider list`)
- **Smart defaults**: `frankenbeast run "task"` works with zero config if any provider CLI is logged in
- **Progressive disclosure**: basic path needs no flags; power users get `--provider`, `--skills`, `--security`
- **Helpful errors**: if no provider is configured, don't just fail — show `Run 'frankenbeast provider add claude' to get started`

**Files:**
- Add: `packages/franken-orchestrator/src/cli/commands/skill.ts`
- Add: `packages/franken-orchestrator/src/cli/commands/provider.ts`
- Add: `packages/franken-orchestrator/src/cli/commands/security.ts`
- Test: `packages/franken-orchestrator/tests/unit/cli/commands/`

### 8.5 — End-to-end integration test

- Full Beast Loop execution through multiple providers
- Simulated rate limit triggers provider switch
- Brain state preserved across switch
- Audit trail captures entire execution including switch
- Dashboard SSE receives all events

**Exit criteria:** Full system works end-to-end. Provider failover tested. Dashboard shows provider state.

---

## Phase 9: Documentation + Cleanup

### 9.1 — Update `docs/ARCHITECTURE.md`

- New 8-package layout with Mermaid diagrams
- Provider registry architecture
- Brain serialize/hydrate flow
- Skill loading pipeline

### 9.2 — Update `docs/RAMP_UP.md`

- Reflect new package count and roles
- Remove references to deleted packages
- Add provider configuration quickstart

### 9.3 — Update `docs/PROGRESS.md`

- Record the consolidation as a milestone

### 9.4 — Cleanup

- Verify all Phase 1 temporary pass-throughs have been replaced with real implementations — grep for `TODO`, `stub`, `pass-through`, and empty `return []` patterns. Any remaining must be resolved or the phase fails.
- Ensure `.gitignore` covers any new build artifacts
- Final `npm test && npm run build && npm run typecheck`

---

## Execution Timeline

| Phase | Description | Estimated Chunks | Dependencies |
|-------|-------------|-----------------|--------------|
| 0 | Stabilize current branch | 2 | None |
| 1 | Remove dead packages | 6 | Phase 0 |
| 2 | Rewrite franken-brain | 4 | Phase 1 (needs clean imports) |
| 3 | Provider registry + adapters | 9 | Phase 2 (needs BrainSnapshot) |
| 4 | Absorb firewall + security profiles | 3 | Phase 1 |
| 5 | Skill loading + marketplace + dashboard mgmt | 8 | Phase 1 + Phase 3 (for discoverSkills) |
| 6 | Absorb reflection into critique | 1 | Phase 1 |
| 7 | Reframe observer | 3 | Phase 3 (needs provider switch events) |
| 8 | Wire everything together + CLI + dashboard | 5 | All previous phases |
| 9 | Documentation + cleanup | 4 | Phase 8 |

**Parallel execution possible:**
- Phases 2, 4, 5, 6 can all run in parallel after Phase 1
- Phase 3 needs Phase 2 (for BrainSnapshot types)
- Phase 7 needs Phase 3 (for provider switch events)
- Phase 8 needs everything
- Phase 9 needs Phase 8

```
Phase 0 → Phase 1 → ┬─ Phase 2 → Phase 3 → Phase 7 ─┐
                     ├─ Phase 4 ─────────────────────────┤
                     ├─ Phase 5 ─────────────────────────┼─ Phase 8 → Phase 9
                     └─ Phase 6 ─────────────────────────┘
```

---

## Risk Mitigations

| Risk | Mitigation |
|------|-----------|
| Phase 1 breaks too many tests | Tag pre-consolidation, delete one package at a time, test after each |
| Brain rewrite loses existing functionality | Map existing brain tests to new interface before deleting old code |
| CLI adapter output format changes | Pin CLI versions in tests, use integration test fixtures |
| MCP SDK instability | Pin `@modelcontextprotocol/sdk` version, wrap in thin adapter |
| Scope creep in provider adapters | v1 = Claude CLI + Anthropic API only. Others get real implementations or are deferred entirely — no stubs as final product. |

## v1 vs Future

**v1 (this plan):**
- Claude CLI + Anthropic API adapters fully working
- Codex + Gemini adapters with unit tests (may use mocked CLIs)
- Keyword-based episodic recall (no embeddings)
- Marketplace skill discovery for Claude and Codex; Gemini discovery deferred until API is available (no stubs shipped — method omitted entirely until real)
- Dashboard skill management: install, toggle, custom MCP, context editor
- Simple/advanced dashboard modes with sensible defaults
- Dual auth: API keys and CLI login
- Configurable security profiles (strict/standard/permissive) via dashboard and CLI
- CLI commands: `run`, `skill`, `provider`, `security`, `dashboard`

**Future:**
- Embedding-based episodic recall (add vector column + model)
- Auto-generated skill context from tool schemas + usage analytics
- Provider cost optimization (route cheap tasks to cheap models)
- Brain encryption at rest for enterprise
- Provider-specific tool format translation (Claude tool_use vs OpenAI function_calling)
- Skill usage analytics (which skills get used, which fail, dashboard metrics)
- Skill sharing/export (export installed skill configs for team distribution)
- Custom security rule builder (dashboard UI for defining security rules)
- Plugin/extension system (secure hooks for custom middleware, evaluators, provider adapters — fork-friendly or plugin-based, TBD)
