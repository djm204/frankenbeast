# Beasts Panel Backend Gaps — Remediation Plan

**Date:** 2026-03-15
**Related spec:** `docs/superpowers/specs/2026-03-15-beasts-panel-ux-design.md`
**Related ADRs:** 022–026

---

## Overview

The beasts panel UX redesign introduces frontend surfaces that outpace the current backend. This document catalogs each gap, its priority, the frontend fallback behavior, and what the backend implementation requires.

**Priority definitions:**
- **P0 (Blocking):** Feature cannot function at all without this endpoint
- **P1 (High):** Feature works with degraded UX; should close within first fast-follow
- **P2 (Medium):** Feature has a reasonable client-side workaround
- **P3 (Low):** Nice-to-have; manual workaround is acceptable

---

## Gap 1: Provider & Model Discovery API

**Priority:** P1

**Current state:** Network page has a hardcoded text input for chat model (`claude-sonnet-4-6`). No API to enumerate available providers or their models.

**Frontend fallback:** Static fallback list of known providers/models. Inline banner: "Provider list may be incomplete — configure providers in network settings."

**Required endpoints:**

```
GET /v1/providers
Response: { providers: [{ id, name, status, modelCount }] }

GET /v1/providers/:id/models
Response: { models: [{ id, name, contextWindow, costPer1kTokens }] }
```

**Backend work:**
- Create `ProviderRegistry` service that aggregates configured providers (from orchestrator config, env vars, or runtime registration)
- Each provider adapter exposes a `listModels()` method
- Register routes in the Beast API router

---

## Gap 2: Per-Action LLM Routing

**Priority:** P1

**Current state:** Single model configured at the network/process level. All LLM-consuming actions use the same model.

**Frontend fallback:** UI captures per-action config and stores it in the agent create payload. Inline banner: "Per-action routing not yet wired — all actions will use the default model."

**Required changes:**

```
// Agent create payload extension
{
  llmConfig: {
    default: { provider: string, model: string },
    overrides: {
      planning?: { provider: string, model: string },
      execution?: { provider: string, model: string },
      critique?: { provider: string, model: string },
      reflection?: { provider: string, model: string },
      chat?: { provider: string, model: string }
    }
  }
}
```

**Backend work:**
- Extend `TrackedAgentCreateInput` schema to accept `llmConfig`
- Orchestrator's `DepFactory` (or equivalent) reads per-action overrides when constructing module dependencies
- Each module that uses an LLM client checks for an action-level override before falling back to the default

---

## Gap 3: Deep Module Configuration API

**Priority:** P1

**Current state:** 7 boolean toggles (`disabledModules` array on `TrackedAgentCreateInput`). No per-module config.

**Frontend fallback:** UI renders config forms but stores values only in the agent create payload. Inline banner per module: "Deep configuration stored but not yet applied by backend."

**Required changes:**

```
// Agent create payload extension
{
  moduleConfig: {
    firewall?: { ruleSet: string, customRules: string },
    memory?: { backend: 'in-memory' | 'sqlite' | 'external', retentionPolicy: string },
    planner?: { maxDagDepth: number, parallelTaskLimit: number },
    critique?: { maxIterations: number, severityThreshold: string },
    governor?: { approvalMode: 'auto' | 'manual' | 'threshold', escalationRules: string },
    heartbeat?: { reflectionInterval: number, llmOverride?: { provider: string, model: string } }
  }
}
```

**Backend work:**
- Define Zod schemas for each module's config surface
- Extend `TrackedAgentCreateInput` to accept `moduleConfig`
- Each module's factory/constructor reads its config slice
- Validate config against module capabilities (e.g., memory backend must be installed)

---

## Gap 4: Skill Registry API

**Priority:** P1

**Current state:** Skills exist in `franken-skills` package but are not exposed via any web API. The beast catalog entries can reference skills, but there's no discovery endpoint.

**Frontend fallback:** UI shows a placeholder skill list or attempts to read from beast catalog metadata. Banner: "Skill registry not yet available — skills from catalog definitions will be used."

**Required endpoint:**

```
GET /v1/skills
Query params: ?search=string&category=string&limit=number&offset=number
Response: {
  skills: [{ id, name, description, category, tags, version }],
  total: number
}
```

**Backend work:**
- Expose `franken-skills` registry via HTTP route
- Add search/filter capability (name, description, category, tags)
- Paginate results

---

## Gap 5: Agent Config Partial Update (Hot-Swap)

**Priority:** P1

**Current state:** Agent lifecycle is stop/start/restart/delete. No way to update configuration on a live agent.

**Frontend fallback:** Edit mode captures changes but requires stop + recreate for all fields. Banner on hot-swappable fields: "Live updates require backend support — restart agent to apply changes."

**Required endpoint:**

```
PATCH /v1/beasts/agents/:id/config
Body: { [field]: value }  // partial update
Response: {
  applied: string[],         // fields applied immediately (hot-swap)
  pendingRestart: string[],  // fields that require restart
  errors: string[]           // fields that couldn't be updated
}
```

**Backend work:**
- Define which fields are hot-swappable vs restart-required (see spec Section 3)
- Implement config diffing and partial application
- For hot-swappable fields: update in-memory agent state, notify running process
- For restart-required fields: store pending config, apply on next restart

---

## Gap 6: Context Health Analysis

**Priority:** P2

**Current state:** No token counting or context analysis utility exists in the web layer.

**Frontend fallback:** Client-side token estimation using a lightweight tokenizer (e.g., `js-tiktoken` or character-based heuristic). Less accurate but functional.

**Required endpoint (optional — client-side may suffice):**

```
POST /v1/tools/analyze-context
Body: { content: string } | { filePath: string }
Response: {
  tokenCount: number,
  health: 'good' | 'warning' | 'critical',
  suggestions: string[]
}
```

**Backend work:**
- Integrate a token counting library (tiktoken or equivalent)
- Define thresholds for health classification
- Generate actionable suggestions for oversized content

**Client-side alternative:**
- Bundle `js-tiktoken` (~800KB wasm) or use a character-ratio heuristic (~4 chars/token)
- Compute health locally — no API call needed
- Trade-off: less accurate, but zero latency and no backend dependency

---

## Gap 7: Context Optimization (LLM-Powered)

**Priority:** P3

**Current state:** No equivalent exists.

**Frontend fallback:** Display actionable guidance text: "This file is ~X tokens. Ask your AI provider: 'Condense this file to under Y tokens while preserving key information for an AI agent working on [task]'." No "Optimize" button until backend support exists.

**Required endpoint:**

```
POST /v1/tools/optimize-context
Body: { content: string, targetTokens: number, taskContext: string }
Response: { optimized: string, originalTokens: number, optimizedTokens: number }
```

**Backend work:**
- Route to configured LLM provider with a condensation prompt
- Stream response for large files
- Cache results to avoid re-processing identical content

---

## Gap 8: Git Workflow Preset System

**Priority:** P1

**Current state:** Backend supports base branch selection and git remote format in orchestrator config. No preset system, branch naming patterns, PR creation toggles, or merge strategy selection.

**Frontend fallback:** UI captures full git config in agent create payload. Backend uses its existing defaults (base branch from orchestrator config). Banner: "Git workflow presets stored — backend applies default git behavior."

**Required changes:**

```
// Agent create payload extension
{
  gitConfig: {
    preset: 'one-shot' | 'feature-branch' | 'feature-branch-worktree' | 'yolo-main' | 'custom',
    baseBranch: string,
    branchPattern: string,
    prCreation: boolean,
    prTemplate?: string,
    commitConvention: 'conventional' | 'freeform',
    mergeStrategy: 'merge' | 'squash' | 'rebase'
  }
}
```

**Backend work:**
- Extend `TrackedAgentCreateInput` to accept `gitConfig`
- Implement preset expansion (preset → concrete git settings)
- Wire git settings into the orchestrator's git operations (branch creation, commit, PR via `PrCreator`)
- Respect merge strategy in PR creation

---

## Gap 9: OS/WSL Path Detection

**Priority:** P2

**Current state:** File/directory pickers pass raw paths with no environment awareness.

**Frontend fallback:** Manual path entry is always available. Client-side heuristic uses `navigator.platform` to guess the browser's OS, but cannot reliably determine the server's OS context (e.g., a Windows browser may target a WSL/Linux backend). Manual path entry is the primary fallback until the backend endpoint exists.

**Required endpoint:**

```
GET /v1/system/environment
Response: {
  os: 'linux' | 'darwin' | 'win32',
  platform: string,
  isWsl: boolean,
  pathSeparator: '/' | '\\'
}
```

**Backend work:**
- New route that returns `os.platform()`, WSL detection (check `/proc/version` for "Microsoft"), and path separator
- Client caches response on dashboard load
- Client-side path normalization uses server OS context:
  - If server is WSL and path starts with `C:\` → normalize to `/mnt/c/...`
  - If server is Linux and path uses backslashes → reject with guidance
  - Display resolved path with environment badge (Windows / WSL / Linux / macOS)
- Validation: reject cross-environment paths (e.g., Windows path when server is Linux)

---

## Implementation Order

| Phase | Gaps | Rationale |
|-------|------|-----------|
| **Fast-follow 1** | Gap 1 (providers), Gap 4 (skills) | Unblocks wizard steps 3 and 5 — currently showing fallback data |
| **Fast-follow 2** | Gap 2 (per-action LLM), Gap 3 (module config), Gap 5 (hot-swap), Gap 8 (git presets) | Activates the core agent config payload and live editing — stored but not applied |
| **Fast-follow 3** | Gap 9 (path detection) | Enables cross-platform path correctness; manual entry is acceptable interim |
| **Fast-follow 4** | Gap 6 (context analysis), Gap 7 (context optimization) | Polish — client-side fallback is acceptable interim |
