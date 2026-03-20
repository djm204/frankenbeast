# Phase 5: Skill Loading — Marketplace-First MCP + Dashboard Management

**Goal:** Skills are marketplace-sourced or custom MCP servers, managed as directory-based configs with optional context, toggleable from run config or dashboard, with per-provider translation at spawn time, install-time auth capture, and health/status metadata for the dashboard.

**Dependencies:** Phase 1 (franken-skills deleted) + Phase 3 (provider adapters implement `discoverSkills()`)

**Why this matters:** Skills give agents access to external tools (GitHub, Linear, code review, etc.) via MCP. The marketplace-first approach means most skills "just work" with the LLM's built-in knowledge of popular tools — no manual context authoring needed.

---

## Design

### Two-Layer Model

1. **MCP tool schemas** — the LLM already knows how to use GitHub, Slack, etc. from training data. Just connecting the MCP server is enough.
2. **Context.md** (optional) — for team-specific conventions ("always create Linear tickets in project X"). Appended to system prompt.

Most marketplace skills need only layer 1. Custom skills or team-specific conventions add layer 2.

### Skill Directory Convention

```
skills/
├── github/               # installed from marketplace
│   └── mcp.json          # auto-generated MCP server config
├── linear/
│   └── mcp.json
├── code-review/           # custom skill with team conventions
│   ├── mcp.json
│   └── context.md         # "always run eslint before suggesting fixes"
```

### Per-Provider Translation

The orchestrator stores skills in a provider-neutral format. At spawn time, each adapter translates:

| Provider | MCP Config | Context Injection |
|----------|-----------|-------------------|
| Claude CLI | `--mcp-config <merged-file>` | `--append-system-prompt` |
| Codex CLI | `codex mcp add` per server | Config file / `-c` |
| Gemini CLI | `settings.json` | `GEMINI.md` |
| API adapters | Tool schemas in request | System message |

### Persistence Model

- Installed skill definitions live in `skills/<name>/`
- Dashboard-managed skill state lives in `.frankenbeast/config.json`
- Run-config `skills:` remains supported as an explicit per-run override

The distinction matters:
- `skills/` stores what exists
- persisted config stores which installed skills are enabled by default
- run config decides what a specific run should use

This keeps dashboard toggles durable without rewriting user-authored YAML on every click.

## Success Criteria

- Skills install from marketplace or custom MCP
- Toggle from run config (`skills: ["github"]`) or API
- Per-provider MCP translation works for all 3 CLI adapters
- Auth supports API keys and CLI login
- Install flow captures auth fields and persists secrets to `.frankenbeast/.env` without writing raw secrets into `mcp.json`
- API routes for skill CRUD
- Dashboard/API enable-disable state persists across restarts
- Context editor has explicit read/write routes
- `GET /api/skills` returns provider origin and MCP status metadata needed by the advanced dashboard
- Dashboard can browse, install, toggle, and manage skills

## Chunks

| # | Chunk | Committable Unit | Can Parallel? |
|---|-------|-----------------|--------------|
| 01 | [Skill directory + schemas](phase5-skill-loading/01_skill-directory-schemas.md) | Zod schemas in `franken-types` | First |
| 02 | [SkillManager](phase5-skill-loading/02_skill-manager.md) | Core CRUD + listing | After 01 |
| 03 | [Provider skill translation](phase5-skill-loading/03_provider-skill-translation.md) | Per-provider MCP config | After 01 |
| 04 | [Skill auth](phase5-skill-loading/04_skill-auth.md) | Env var resolution + CLI login | After 01 |
| 05 | [Provider skill discovery](phase5-skill-loading/05_provider-skill-discovery.md) | `discoverSkills()` implementations | After 01 |
| 06 | [Skill API routes](phase5-skill-loading/06_skill-api-routes.md) | REST endpoints | After 02 |
| 07 | [Context stuffing](phase5-skill-loading/07_context-stuffing.md) | System prompt injection | After 03 |
| 08 | [Migrate beast definitions](phase5-skill-loading/08_migrate-beast-definitions.md) | Existing defs → skill dirs | After 02 |
| 09 | [Skill install auth persistence](phase5-skill-loading/09_skill-install-auth-persistence.md) | Capture auth values + persist `.frankenbeast/.env` + extend install API | After 04+05+06 |
| 10 | [Skill health + provider metadata](phase5-skill-loading/10_skill-health-provider-metadata.md) | Provider origin + MCP health in `GET /api/skills` | After 02+06+09 |
| 11 | [Skill toggle persistence + context routes](phase5-skill-loading/11_skill-toggle-persistence-context-routes.md) | Persist enabled state + add `context.md` read/write routes | After 02+06 |

**Parallelism:** 01 first. Then 02–05 in parallel. 06–08 after 02. Chunk 09 after auth, discovery, and routes exist. Chunk 10 after install metadata and routes exist. Chunk 11 after core CRUD/routes exist.
