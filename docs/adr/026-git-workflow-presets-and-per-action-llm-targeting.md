# ADR-026: Git Workflow Presets and Per-Action LLM Targeting

- **Date:** 2026-03-15
- **Status:** Accepted
- **Deciders:** djm204

## Context

Agent creation currently has no UI for configuring git strategy or LLM model selection beyond a single chat model in the network page. The redesign requires:

1. **Git workflow presets** — predefined strategies (one-shot, feature branch, feature branch + worktree, YOLO on main, custom) that pre-fill git settings (branch naming, PR creation, merge strategy) while allowing per-field overrides.
2. **Per-action LLM targeting** — each LLM-consuming action (planning, execution, critique, reflection, chat) should be independently configurable with a provider → model pair, falling back to process-level defaults when not set.

Both features have backend gaps (documented in `docs/plans/2026-03-15-beasts-panel-backend-gaps.md`). This ADR covers the frontend design decisions and the fallback strategy.

## Decision

### Git Workflow Presets

Implement 5 presets as a radio-card selection, each pre-filling an override form:

| Preset | Branch | PR | Merge |
|--------|--------|----|-------|
| One-shot | target branch directly | none | n/a |
| Feature Branch | `feat/{agent-name}/{id}` | auto-create | squash |
| Feature Branch + Worktree | same + isolated worktree | auto-create | squash |
| YOLO on Main | `main` directly | none | n/a |
| Custom | (blank) | (blank) | (blank) |

Override fields (base branch, branch pattern, PR creation, commit convention, merge strategy) are always visible below presets. Preset selection pre-fills values; user overrides are preserved.

### Per-Action LLM Targeting

Two cascading selects (provider → model) for each action type. Provider list populated from a `GET /v1/providers` endpoint (when available). Each action defaults to "Use default" (inherits from agent-level default, which itself falls back to process-level config).

**Fallback chain:** action-level → agent-level default → process-level provider config.

**Gap handling:** When backend endpoints for provider discovery or per-action routing don't exist, the UI:
- Shows available models from a static fallback list (hardcoded known providers/models)
- Renders an inline banner: "Per-action routing not yet wired — all actions will use the default model"
- Stores the full configuration in the agent create payload so it's ready when the backend catches up

## Consequences

### Positive
- Git presets eliminate repetitive configuration for common workflows
- Override fields give full control without sacrificing the convenience of presets
- Per-action LLM targeting enables cost optimization (cheap models for reflection, powerful models for execution)
- Graceful degradation means the UI is immediately usable, with backend gaps closing over time
- Configuration is stored even before backend support exists — no data loss during the transition

### Negative
- Git preset semantics must be kept in sync between frontend and backend
- Per-action model config UI adds complexity to the wizard (6+ action types × 2 selects each)
- Static fallback model list requires manual updates when new providers/models are added

### Risks
- Frontend configuration structure could diverge from eventual backend schema (mitigated: design the agent create payload schema first, have both frontend and backend conform to it)
- Users may configure per-action models that the backend silently ignores (mitigated: gap banners make the limitation explicit)

## Alternatives Considered

| Option | Pros | Cons | Rejected Because |
|--------|------|------|-----------------|
| No presets — manual git config only | Simpler implementation | Repetitive for common workflows, higher error rate | Poor UX for the 80% case; presets with override is strictly better |
| Presets without overrides | Simplest possible implementation | Can't customize branch naming, PR behavior, etc. | Too rigid; real projects have varying conventions |
| Single model per agent (no per-action) | Much simpler UI and backend | Can't optimize cost or quality per action type | Misses a key value prop — different actions have different quality/cost tradeoffs |
| Model selection without provider | Simpler UI (one select instead of two) | Ambiguous when same model name exists across providers | Provider → model cascade is the correct mental model |
