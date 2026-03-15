# Technical Overview — Critique Remediation

> For each critique of `docs/TECHNICAL_OVERVIEW.md`, at least 2 viable solutions. Pick one per critique, or combine.

---

## Critique 1: The "2,567 tests" number is doing heavy lifting

**Problem:** Raw test count implies comprehensive coverage. 40% (1,018) are in the orchestrator — the package that stubs most modules. A reader could assume those tests validate the full guardrails pipeline when they actually test CLI execution, session management, and issue pipeline against stubs.

### Solution A: Break test counts into "real integration" vs "unit with stubs"

Add a second table that categorizes tests by what they actually exercise:

```markdown
| Category | Tests | What they prove |
|----------|-------|-----------------|
| Module logic (standalone) | ~1,200 | Individual module internals work in isolation |
| Orchestrator CLI pipeline | ~650 | CLI execution, session mgmt, issue pipeline work with real observer, fake everything else |
| Orchestrator E2E (full loop) | ~50 | Beast Loop phases run correctly against in-memory ports |
| Cross-package contracts | ~162 | Port interfaces are compatible across packages |
| Conformance suites | ~30 | Adapter implementations satisfy shared interface contracts |
| Stub-only paths | ~475 | Code paths that exercise stubs (governor auto-approve, critique auto-pass, etc.) |
```

This lets the reader see that ~1,200 tests validate real module logic, ~650 validate the real CLI machinery, and ~475 are testing code paths where the interesting module is stubbed out.

### Solution B: Report coverage by "guardrail active" vs "guardrail stubbed"

Instead of per-package counts, report what percentage of tests run with each guardrail actually active:

```markdown
| Guardrail | Active in N tests | Stubbed in N tests |
|-----------|-------------------|--------------------|
| Observer/budget enforcement | 1,500+ | ~200 |
| Injection detection | ~200 | ~2,300 |
| Critique loop | ~146 (critique pkg only) | ~2,400 |
| Governor approval | ~136 (governor pkg only) | ~2,400 |
| Memory hydration | ~175 (brain pkg only) | ~2,350 |
```

This makes the gap visceral — critique is tested in 146 tests, all inside its own package. Zero orchestrator tests run with critique active.

### Solution C: Drop the headline number entirely

Remove "2,567 tests" from being a lead metric. Replace with qualitative statements per package: "franken-observer: 373 tests covering real tracing, cost calculation, and eval execution" is more honest than a sum that implies uniform depth.

---

## Critique 2: "Fully implemented" is generous for modules that don't run

**Problem:** Calling franken-brain, franken-planner, franken-governor, franken-heartbeat "fully implemented" when they're stubbed in the only execution path is misleading. Library code with passing unit tests isn't the same as "implemented" in the product sense.

### Solution A: Use a 3-tier status vocabulary

Replace "Fully implemented" with a clear taxonomy:

| Status | Meaning |
|--------|---------|
| **Wired** | Code exists, tests pass, actively participates in CLI execution |
| **Library-complete** | Code exists, tests pass, not wired into any execution path |
| **Stub** | Interface defined, implementation is placeholder or minimal |

Then the table becomes:

| Package | Status |
|---------|--------|
| franken-observer | Wired |
| frankenfirewall | Library-complete (dynamic import can enable) |
| franken-brain | Library-complete |
| franken-planner | Library-complete (bypassed by LlmGraphBuilder) |
| franken-critique | Library-complete (dynamic import can enable) |
| franken-governor | Library-complete (designed for service mode) |
| franken-heartbeat | Library-complete |
| franken-skills | Stub (execution via CliSkillExecutor instead) |

No ambiguity about what "implemented" means.

### Solution B: Lead with "what runs" and relegate module inventory to appendix

Restructure the doc so the first section after "What It Is" is "What Runs Today" — describing only the active CLI pipeline. Move the 13-package table to an appendix section called "Module Inventory" with a clear header: "The following modules exist as standalone libraries. Unless marked 'active in CLI', they are not part of the default execution path."

This forces the reader to encounter reality first and the full inventory second.

---

## Critique 3: The architecture diagram is aspirational, not actual

**Problem:** The Beast Loop diagram shows all 8 modules participating. 5 are stubbed. The diagram depicts the target state while the doc claims honesty.

### Solution A: Two diagrams — current and target

```markdown
### Current CLI Path (what runs today)

    User Input
        │
        ▼
    ┌───────────────────────────────────────┐
    │             BEAST LOOP                │
    │                                       │
    │  Ingestion → Planning → Execution → Closure
    │      │          │           │          │
    │   (stub)    LlmGraph    CliSkill    Observer ✓
    │              Builder    Executor    (real cost,
    │            (real LLM)  (real LLM)   tokens, budget)
    │                                       │
    │  Circuit Breakers: budget ✓ │ injection ✓
    └───────────────────────────────────────┘

### Target Architecture (not yet wired)

    [full diagram with all modules]
```

### Solution B: Single annotated diagram

Keep one diagram but annotate each module with its actual status inline:

```
    Firewall [stub]     Planner [bypassed]     Skills [via CliSkillExecutor]     Observer [ACTIVE]
    Memory [stub]       Critique [stub]        Governor [auto-approve]           Heartbeat [stub]
```

This is uglier but impossible to misread.

---

## Critique 4: No performance data

**Problem:** Zero mention of latency, throughput, memory footprint, or real-world cost tracking results. A framework claiming cost enforcement should show evidence.

### Solution A: Add a "Real-World Execution Data" section

Run `frankenbeast` against a real task (e.g., fix a known GitHub issue) and capture:

- Wall-clock time per phase (ingestion, planning, execution, closure)
- Token consumption (prompt + completion) per chunk iteration
- USD cost tracked by CliObserverBridge
- Memory footprint of the orchestrator process
- Number of MartinLoop iterations before completion
- Context compaction triggers (how often 85% threshold hit)

Present this as raw data, not marketing. Example:

```markdown
### Sample Execution: Fix a 15-line bug across 2 files

| Metric | Value |
|--------|-------|
| Total wall time | 4m 12s |
| Planning phase | 18s (1 LLM call, 1,200 tokens) |
| Execution phase | 3m 48s (3 MartinLoop iterations) |
| Total tokens | 42,000 (prompt) + 8,500 (completion) |
| Tracked cost | $0.87 (Claude Sonnet) |
| Context compaction triggered | No (peak 61% usage) |
| Checkpoint writes | 3 |
```

### Solution B: Add a benchmarks directory

Create `benchmarks/` with reproducible scripts that run against `FakeLlmAdapter` (no API key needed) and measure:

- Beast Loop phase latency with stubs vs real modules
- Observer overhead (tracing + cost calc per span)
- Checkpoint serialization/deserialization time
- MartinLoop iteration overhead
- ChunkSession compaction time at various transcript sizes

This gives verifiable numbers without requiring API keys. Document results in the overview.

---

## Critique 5: The "Honest Assessment" section buries the lede

**Problem:** The most important fact — that the guardrails framework doesn't guard with most guardrails — is at the bottom after pages of architecture and test counts.

### Solution A: Lead with a status box

Put this immediately after "What It Is":

```markdown
## Current Status

Frankenbeast is a **partially-integrated** guardrails framework. Of its 8 core modules:

- **1 is fully wired** into the CLI execution path (Observer — cost tracking, budget enforcement)
- **2 can be dynamically enabled** but default to stubs (Firewall, Critique)
- **5 are stubbed** in the CLI path (Memory, Planner, Governor, Heartbeat, Skills)

The CLI pipeline executes real LLM work with real cost tracking and crash recovery,
but critique, governance, memory, and reflection do not participate by default.
```

Then the rest of the doc provides detail. The reader knows the state of affairs before investing time in architecture diagrams.

### Solution B: Restructure the entire doc as "what works / what doesn't / what's planned"

Three top-level sections instead of the current architecture-first layout:

1. **What Works Today** — CLI execution, observer, providers, crash recovery, issue pipeline
2. **What Exists But Isn't Wired** — the 5 stubbed modules, with explanation of why
3. **Architecture & Design** — the full picture, clearly labeled as partially realized

This makes the doc impossible to skim without absorbing the current state.

---

## Critique 6: Missing — who is this for?

**Problem:** No target user defined. The reader can't evaluate the project without knowing the intended audience.

### Solution A: Add a "Who This Is For" section

```markdown
## Who This Is For

Frankenbeast targets **developers and teams running AI coding agents in production** who need:

- Hard budget limits (not "please try to stay under $5" — actual circuit breakers)
- Audit trails (every LLM call traced with cost, latency, token count)
- Crash recovery (long-running agent tasks that survive process restarts)
- Provider flexibility (switch between Claude, Codex, Gemini without rewriting)

It is NOT a hosted service, a no-code platform, or an agent framework itself.
It wraps existing agents with controls they can't bypass.
```

### Solution B: Add a "Use Cases" section with concrete examples

```markdown
## Use Cases

1. **Automated issue fixing with budget caps** — `frankenbeast issues --label bug`
   fetches GitHub issues, triages by severity, fixes them with LLM agents,
   creates PRs, and stops if the token budget is exceeded.

2. **Design-to-implementation pipeline** — Feed a design doc, get chunk decomposition,
   execute each chunk with crash recovery and git branch isolation.

3. **Multi-provider fallback** — Primary provider rate-limited? Automatically cascade
   to the next provider in the chain without losing session state.
```

Concrete examples let the reader self-select without an explicit audience definition.

---

## Critique 7: No comparison to existing solutions

**Problem:** Guardrails AI, NeMo Guardrails, and Langchain safety tooling exist. The doc doesn't acknowledge them or explain differentiation.

### Solution A: Add a positioning table

```markdown
## How This Differs From Existing Tools

| | Guardrails AI | NeMo Guardrails | LangChain Safety | Frankenbeast |
|---|---|---|---|---|
| **Focus** | Output validation | Conversational rails | Chain-level safety | Full agent lifecycle |
| **Scope** | Single LLM call | Dialog flow | Chain/tool execution | Multi-phase pipeline with planning, execution, reflection |
| **Budget enforcement** | No | No | Callbacks (manual) | Circuit breaker with real-time USD tracking |
| **Crash recovery** | No | No | No | Checkpoint-based, provider-agnostic session state |
| **Provider-agnostic execution** | Partial | No (NVIDIA focused) | Yes (via abstractions) | Yes — pluggable CLI providers with automatic fallback |
| **Human-in-the-loop** | No | No | No | Governor module with Slack/Discord/webhook channels* |
| **Self-critique loop** | No | No | No | 8-evaluator critique pipeline* |

*Exists as library code but not wired into default CLI path.
```

The asterisks maintain honesty while showing architectural differentiation.

### Solution B: Prose positioning without a comparison table

```markdown
## Positioning

Most guardrails tools (Guardrails AI, NeMo Guardrails) focus on **single-call output validation** —
checking that one LLM response meets a schema or doesn't contain harmful content.

Frankenbeast operates at a different level: it wraps the **entire agent execution lifecycle** —
from input sanitization through task planning, multi-step execution, cost accounting, and
post-execution reflection. The closest analogy is a deterministic supervisor process that
sits between the human and the AI agent, enforcing rules the agent cannot override.

The trade-off: single-call guardrails are production-ready today with minimal integration.
Frankenbeast requires adopting its orchestration model, which is a larger commitment
for a framework that hasn't yet wired all its own modules.
```

This is honest — acknowledges the competition is production-ready and frankenbeast isn't fully wired.

---

## Critique 8: The 4 CLI providers claim needs qualification

**Problem:** 4 CLI providers are listed (Claude, Codex, Gemini, Aider) but 2 firewall adapters (Gemini, Mistral) are stubs. The doc conflates the provider layer with the firewall adapter layer.

### Solution A: Separate the two layers explicitly

```markdown
### Provider Support Matrix

| Provider | CLI Execution (CliSkillExecutor) | Firewall Adapter (standalone proxy) |
|----------|--------------------------------|-------------------------------------|
| Claude | Full | Full |
| OpenAI/Codex | Full | Full |
| Ollama | N/A (local models) | Full |
| Gemini | Full | Stub (throws "Not implemented") |
| Aider | Full | N/A (LiteLLM handles routing) |
| Mistral | N/A | Stub (throws "Not implemented") |
```

Add a note: "CLI providers and firewall adapters are independent layers. A provider can execute tasks without the firewall proxy being wired for that provider. The firewall is only relevant when running frankenfirewall as a standalone HTTP proxy."

### Solution B: Drop the "4 CLI providers" as a headline feature

Demote to a detail under CLI capabilities:

```markdown
The CLI supports multiple AI agent providers via `--provider` and `--providers` (fallback chain).
Built-in: Claude (primary, most tested), Codex, Gemini, Aider.
Claude and Codex have full end-to-end coverage including firewall proxy support.
Gemini and Aider work for CLI execution but lack firewall proxy adapters.
```

Less impressive-sounding, more accurate.

---

## Critique 9: "Hexagonal architecture" is stated but not proven

**Problem:** The doc claims hex arch as a strength but provides no evidence a module has actually been swapped at runtime. Stubs are the trivial case.

### Solution A: Document a real swap that happened

The project already has one: `LlmGraphBuilder` replaced `franken-planner` in the CLI path. The observer went from stub to real `CliObserverBridge`. Document these as proof:

```markdown
### Hexagonal Architecture in Practice

The port-and-adapter pattern has been validated by real substitutions:

1. **Observer: stub → real** — The observer started as a stub returning empty spans.
   `CliObserverBridge` replaced it with real token counting, cost tracking, and budget
   enforcement. No orchestrator code changed — only `dep-factory.ts` wiring.

2. **Planner: module → alternative** — `franken-planner` was designed for the planning phase
   but `LlmGraphBuilder` replaced it for CLI use. The orchestrator's `IGraphBuilder` port
   accepted both without modification.

3. **Providers: single → pluggable** — CLI execution originally hardcoded Claude.
   `ProviderRegistry` + `ICliProvider` interface now supports 4 providers with runtime
   selection. MartinLoop cascades through providers on rate limits without code changes.

These aren't hypothetical. They're merged PRs.
```

### Solution B: Add a "swap it yourself" example

Show the reader how to wire a different module in 10 lines:

```markdown
### Replacing a Module

Any module can be swapped by changing its factory in `dep-factory.ts`. Example — enabling
real critique instead of the stub:

    // Before (stub):
    const critique = stubCritique;

    // After (real):
    const { createCritiqueModule } = await import('@frankenbeast/critique');
    const critique = createCritiqueModule({ evaluators: defaultEvaluators, maxIterations: 3 });

The orchestrator doesn't know or care which implementation it received.
Both satisfy `ICritiqueModule`.
```

This proves the architecture works by showing how little code is needed to swap.

---

## Critique 10: franken-web dilutes credibility

**Problem:** 6 tests for a full React dashboard. Including it alongside production-grade modules undermines the doc's credibility.

### Solution A: Separate "core framework" from "tooling"

Split the package table into two sections:

```markdown
### Core Framework (13 packages)
[the 12 packages that aren't franken-web]

### Development Tooling
| Package | Role | Status |
|---------|------|--------|
| **franken-web** | React dashboard for beast dispatch, chat, and metrics | Development tool. Functional but not tested (6 tests). Not published. Not part of the guardrails framework itself. |
```

This clearly labels it as a dev convenience, not a framework component.

### Solution B: Remove franken-web from the overview entirely

It's a dev tool. The portfolio doc is about the guardrails framework. Move it to a footnote:

```markdown
> A React development dashboard (`franken-web`) provides a chat UI and beast dispatch
> controls for local development. It is not part of the framework and is not covered
> in this overview.
```

The doc becomes 12 packages, all of which have meaningful test coverage.

### Solution C: Invest in testing it

If the dashboard is worth showing in a portfolio, it's worth testing. Add basic tests:

- Component rendering (beast catalog, dispatch form, chat UI)
- WebSocket connection lifecycle
- Module toggle state management

Even 30-40 tests would move it from "negligible" to "reasonable for a dev tool." But only do this if the dashboard is actually something you want to showcase.

---

## Implementation Priority

If applying these fixes to the doc, recommended order:

1. **Critique 5** (bury the lede) — highest impact, restructure-level change
2. **Critique 2** (status vocabulary) — changes every package description
3. **Critique 3** (diagram) — visual credibility
4. **Critique 6** (audience) — 5 minutes to add, large readability improvement
5. **Critique 1** (test counts) — re-categorize existing data
6. **Critique 9** (hex arch proof) — document what already happened
7. **Critique 8** (provider qualification) — small table addition
8. **Critique 10** (franken-web) — quick restructure
9. **Critique 7** (competition) — requires careful framing
10. **Critique 4** (performance data) — requires running real benchmarks, most effort
