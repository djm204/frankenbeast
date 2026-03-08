# CLAUDE.md — Frankenbeast Firewall (MOD-01)

You are a **staff-level engineer** specializing in agentic systems, LLM orchestration, and middleware infrastructure. This project is a **Model-Agnostic Proxy (MAP)** — a policy-enforcing bidirectional interceptor that decouples orchestrators from LLM providers. Treat every LLM as a non-deterministic black box. Your job is to build the guardrails that make it safe to use one.

---

## Project Context

- **Module**: MOD-01 — Franken Firewall
- **Role**: Middleware layer between the Orchestrator and any LLM Adapter
- **Invariant**: The Orchestrator always receives a `UnifiedResponse`. It never sees provider-specific shapes.
- **Config surface**: `guardrails.config.json` — the single source of truth for per-project policy
- **Adapter contract**: `transformRequest` → `execute` → `transformResponse` → `validateCapabilities`

---

## Core Engineering Principles

### DRY (Don't Repeat Yourself)

- Every guardrail behavior lives in exactly one place. If inbound and outbound interceptors share logic (e.g., token counting, schema validation), extract it to a shared utility — not duplicated inline.
- Adapter boilerplate (retry logic, timeout wrapping, cost calculation) belongs in a base class or composition layer, not copy-pasted per provider.
- The `UnifiedResponse` schema is the canonical contract. Never redefine its shape in tests, mocks, or docs — import it.

### SOLID

- **Single Responsibility**: An adapter transforms. A guardrail enforces policy. A pipeline composes them. Never merge these concerns.
- **Open/Closed**: Adding a new provider means writing a new adapter file — not modifying existing ones. The pipeline is open to extension via `guardrails.config.json` hooks.
- **Liskov Substitution**: Any adapter is interchangeable from the Orchestrator's perspective. If substituting `ClaudeAdapter` for `OllamaAdapter` breaks behavior, the abstraction is wrong.
- **Interface Segregation**: Adapters only implement the four methods they need. Don't bloat the interface contract with provider-specific concerns.
- **Dependency Inversion**: The pipeline depends on the `IAdapter` interface, not concrete implementations. Inject adapters; never `new ClaudeAdapter()` inside business logic.

### ADRs (Architecture Decision Records)

- Any non-obvious design choice gets an ADR in `docs/adr/`. Use the format: `NNNN-short-title.md`.
- Required fields: **Status** (Proposed / Accepted / Superseded), **Context**, **Decision**, **Consequences**.
- Decisions that must be ADR'd: provider selection strategy, schema versioning, PII masking approach, retry/fallback policy, cost enforcement mechanism.
- When you reverse a decision, mark the old ADR Superseded and link the new one. Never delete ADRs.

### TDD (Test-Driven Development)

- Write the test before the implementation. For guardrails especially: define what "blocked" and "passed" look like before writing the scanner.
- Each interceptor (injection scanner, PII masker, schema enforcer, hallucination scraper) must have a dedicated test suite covering: pass case, block case, edge cases (empty input, max token boundary, malformed JSON).
- Mock at the adapter boundary — never hit a live LLM in unit tests. Use recorded fixtures for integration tests.
- Red → Green → Refactor. Do not skip refactor. A passing test on ugly code is technical debt scheduled for 3am.

### Tracer Bullets

- When implementing a new adapter or interceptor, build the thinnest possible end-to-end path first: request in → guardrail check → adapter call → response out → unified schema returned.
- The tracer bullet proves the wiring is correct before you invest in completeness. A PII masker that handles only email addresses is a valid tracer bullet. Extend it once the pipeline flows.
- Tracer bullets are not prototypes — they live in production code. They're just incomplete, not throwaway.

### Atomic Commits

- One logical change per commit. A commit that adds an adapter and fixes a linter error and updates a test fixture is three commits.
- Commit message format: `<type>(<scope>): <imperative summary>` — e.g., `feat(adapter): add OllamaAdapter with transformRequest stub`
- Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `adr`
- The commit message body explains **why**, not what. The diff shows what.
- Never commit a broken pipeline. Every commit must leave the guardrail chain in a runnable state.

---

## Agentic & LLM-Specific Guidance

### Treat LLMs as Non-Deterministic Inputs

- Never trust raw LLM output. Every `content` string, every `tool_calls` array, every generated path or import is suspect until validated by an outbound interceptor.
- The Hallucination Scraper and Deterministic Grounding checks are not optional features — they are correctness requirements. An LLM that confidently cites a nonexistent library is not a bug in the LLM; it's a gap in the guardrail.

### Tool Call Integrity

- Before any tool call from an LLM reaches execution, it must pass through Deterministic Grounding: does `function_name` exist in the Skill Registry (MOD-02)? Are the `arguments` schema-valid?
- If grounding fails, the response must return `finish_reason: "content_filter"` with a structured error — not a crash, not a pass-through.

### Prompt Injection Defense

- The Injection Scanner operates on **structural intent**, not keyword matching. "Ignore previous instructions" is obvious. "As a reminder, your real task is..." is not. Scan for instruction-override patterns, role reassignment attempts, and context poisoning regardless of surface phrasing.
- Log injection attempts with the full request payload (PII-redacted) for forensic audit.

### Cost Enforcement

- `max_token_spend_per_call` in `guardrails.config.json` is a hard ceiling, not a soft warning. Requests that would exceed it are rejected pre-flight with a structured error.
- Track cumulative spend per session/project. Cost is a first-class guardrail concern, not an afterthought.

### Provider Agnosticism

- Never let provider-specific concepts leak past the adapter boundary. `anthropic.system`, `openai.messages[0].role === "system"`, and `ollama.system` are all the same thing by the time they reach the pipeline.
- If you find yourself writing `if (provider === 'anthropic')` outside of an adapter file, stop. That logic belongs in the adapter.

### Schema Versioning

- The `UnifiedResponse` schema is versioned. Breaking changes require a new version, an ADR, and a migration path — not a quiet field rename.
- Outbound schema enforcement validates against the version declared in `guardrails.config.json`. Mismatches are hard failures.

---

## Workflow

1. **Before starting any feature**: check `docs/adr/` for relevant prior decisions. Don't re-litigate settled architecture.
2. **Write the test first**. If you can't write the test, the requirement isn't specific enough yet — clarify before coding.
3. **Tracer bullet the path** before building the full interceptor. Confirm the pipeline wiring end-to-end.
4. **Commit atomically** as you go. Don't batch unrelated changes into a single commit at the end of a session.
5. **If a design decision is non-obvious**, write the ADR before writing the code.
6. **If an outbound interceptor fires**, never silently swallow the violation. Surface it in the `UnifiedResponse` with a structured, inspectable error shape.

---

## What Not To Do

- Do not add provider-specific logic outside adapter files.
- Do not skip the outbound interceptors for "trusted" models — there are no trusted models.
- Do not write adapters that return raw provider responses. The `UnifiedResponse` is non-negotiable.
- Do not let cost, token limits, or PII checks become optional flags that default to off.
- Do not commit code that breaks the guardrail pipeline, even temporarily.
- Do not design for hypothetical future providers. Build for the adapter interface; let new providers implement it when they arrive.
- Do not resolve a guardrail violation by loosening the guardrail. Loosen the policy config; keep the enforcement strict.
