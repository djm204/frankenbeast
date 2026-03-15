# Incomplete Plans — Reconciliation Report

> Generated 2026-03-14. Review and update as work progresses.

---

## IN-PROGRESS

### 1. Dashboard Agent Configuration (~60%)
**File:** `2026-03-09-dashboard-agent-configuration-implementation-plan.md`

**What's done:**
- Module toggle UI (ModuleConfig, per-agent `enabledModules`) — merged PR #221
- Core dispatch plumbing passes moduleConfig through backend

**What's missing:**
- Per-LLM model configuration UI (model selection, temperature, etc.)
- Budget guardrail settings screen
- Provider fallback configuration UI
- No dedicated agent-config settings page in franken-web (only inline toggles on dispatch)

**Note:** Copy exists in `complete/` from a prior move — that was premature. The settings control plane described in the plan is not built.

---

### 2. Issues Provider Fallback (~70%)
**Files:** `2026-03-12-issues-provider-fallback-design.md`, `2026-03-12-issues-provider-fallback-implementation-plan.md`

**What's done:**
- `CliLlmAdapter` rate-limit detection and provider fallback chain (commit `643ed9f`, PR #213)
- `IssueRunner` delegates via `fullDeps` which carries provider config

**What's missing:**
- `IssueTriage` LLM calls don't receive explicit provider/fallback configuration
- `IssueGraphBuilder` decomposition LLM calls don't have provider propagation
- No integration test for end-to-end provider fallback through triage → decomposition → execution

---

### 3. Unified Issue Pipeline (~40%)
**File:** `unified-issue-pipeline.md`

**What's done:**
- Phase 2: Issue execution standardized via chunk-file pipeline (PR #208)
- Phase 3 (partial): Stale-mate limits exist (`ONE_SHOT_STALE_MATE_LIMIT = 3`)

**What's missing:**
- Phase 1: `ChunkSessionRenderer` transcript pruning not implemented
- Phase 1: Promise instruction strengthening not implemented
- Phase 1: Aggressive context compaction not implemented
- All 7 checkboxes in the file remain unchecked

---

## NOT STARTED

### 4. BeastLoop Tier 5 Wiring (Heartbeat)
**File:** `2026-03-13-beastloop-tier-5-wiring-design.md`
**Status:** Draft design only. `heartbeat-adapter.ts` shell exists in `src/adapters/`, but `dep-factory.ts` still uses `stubHeartbeat`. No implementation branch merged.
**Dependency:** Tiers 3-4 are now complete.

### 5. Plan Critique System
**Files:** `2026-03-09-plan-critique-system-design.md`, `2026-03-09-plan-critique-system-implementation-plan.md`
**Status:** Not started. `ChunkValidator` + `ChunkRemediator` are still the only validation mechanism. No `IPlanEvaluator`, `PlanCritiqueRunner`, or evaluator implementations exist. A `plan-critique` config key exists (scaffolding intent) but nothing behind it.

### 6. Work Command
**Files:** `2026-03-10-work-command-design.md`, `2026-03-10-work-command-implementation-plan.md`
**Status:** Not started. No `work` subcommand in `args.ts`. No `src/work/` directory. No plan frontmatter parsing or `plan prepare` subcommand.

### 7. LLM Error Awareness Memory Injection
**File:** `2026-03-09-llm-error-awareness-memory-injection-plan.md`
**Status:** Not started. No canonical error-awareness rule, no injection mechanism in prompt builders, no deduplication. Memory hydration loads `rules` and `knownErrors` but the specific error-awareness injection described here is not implemented.

### 8. File Store Integrations
**File:** `2026-03-08-file-store-integrations-implementation-plan.md`
**Status:** Not started. No Google Drive, Dropbox, or S3 adapter code. No branches or commits.

### 9. Productivity Integrations
**File:** `2026-03-08-productivity-integrations-implementation-plan.md`
**Status:** Not started. No Google Sheets, Calendar, Docs, or Gmail adapter code. No branches or commits.

---

## Priority Recommendation

Based on dependency order and impact:

1. **Tier 5 Wiring** — Heartbeat reflection, tiers 3-4 dependency now satisfied
2. **Issues Provider Fallback** — Close to done, finish propagation through triage/decomp
3. **Plan Critique System** — Improves plan quality validation
4. **Unified Issue Pipeline Phase 1** — Context optimization for long-running issues
5. **Work Command** — UX improvement, lower priority
6. **LLM Error Awareness** — Quality improvement, lower priority
7. **Dashboard Agent Config** — Settings UI, lower priority (inline toggles work for now)
8. **File Store / Productivity Integrations** — Future expansion, lowest priority
