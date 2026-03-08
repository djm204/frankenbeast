# Implementation Plan — Frankenbeast Firewall (MOD-01)

Each phase is independently deployable and rollback-safe. Phases within a chunk share a dependency order; chunks are independent of each other where noted. Every bullet is one atomic commit.

---

## Chunk 1 — Foundation: Types, Schema, Config

**Goal**: Establish the canonical contracts that everything else depends on. No business logic. Pure types and config loading. Safe to land and sit idle — nothing calls this yet.

**Rollback**: Delete the files. Zero runtime impact.

---

### Phase 1.1 — Project scaffold & toolchain

- `chore(scaffold): init TypeScript project with tsconfig, eslint, prettier`
- `chore(test): add vitest with coverage thresholds (80% lines/branches)`
- `chore(ci): add lint + typecheck + test scripts to package.json`
- `docs(adr): ADR-0001 — TypeScript as implementation language`

### Phase 1.2 — Unified schema types

- `feat(types): define UnifiedRequest schema (messages, system, tools, config ref)`
- `feat(types): define UnifiedResponse schema (id, model_used, content, tool_calls, finish_reason, usage)`
- `feat(types): define GuardrailViolation error shape (code, message, interceptor, payload)`
- `test(types): type-only tests — assert schema shapes via tsd or expect-type`
- `docs(adr): ADR-0002 — UnifiedResponse as version 1 canonical contract`

### Phase 1.3 — Config loader

- `feat(config): define GuardrailsConfig interface matching guardrails.config.json`
- `feat(config): implement loadConfig() — reads, validates, and freezes config at startup`
- `test(config): loadConfig returns typed config for valid file`
- `test(config): loadConfig throws structured error for missing required fields`
- `test(config): loadConfig throws on unknown provider in allowed_providers`
- `chore(config): add example guardrails.config.json to repo root`

---

## Chunk 2 — Adapter Interface & Base Adapter

**Goal**: Define the `IAdapter` contract and a `BaseAdapter` with shared infrastructure (retry, timeout, cost calculation). No concrete provider yet — just the skeleton everything will extend.

**Rollback**: Remove `src/adapters/`. No pipeline exists to call it yet.

**Depends on**: Chunk 1 (types)

---

### Phase 2.1 — IAdapter interface

- `feat(adapter): define IAdapter interface (transformRequest, execute, transformResponse, validateCapabilities)`
- `docs(adr): ADR-0003 — four-method adapter contract as provider boundary`
- `test(adapter): type test — assert any IAdapter impl satisfies the interface`

### Phase 2.2 — BaseAdapter

- `feat(adapter): implement BaseAdapter with configurable retry logic (exponential backoff)`
- `feat(adapter): implement timeout wrapper in BaseAdapter.execute()`
- `feat(adapter): implement cost calculation helper (input_tokens + output_tokens → cost_usd)`
- `test(adapter): BaseAdapter retry — exhausts retries and throws on persistent failure`
- `test(adapter): BaseAdapter timeout — rejects after configured ms`
- `test(adapter): cost calculation — known token counts produce expected cost_usd`

### Phase 2.3 — Adapter registry & factory

- `feat(adapter): implement AdapterRegistry — maps provider name → IAdapter instance`
- `feat(adapter): implement getAdapter(providerName) — throws if provider not in allowed_providers`
- `test(adapter): getAdapter resolves registered provider`
- `test(adapter): getAdapter throws GuardrailViolation for unregistered provider`

---

## Chunk 3 — Claude Adapter (Tracer Bullet: first concrete provider)

**Goal**: First real end-to-end path through the adapter layer. Proves the IAdapter contract works against a real provider shape. Use recorded HTTP fixtures — no live API calls in tests.

**Rollback**: Delete `src/adapters/claude/`. BaseAdapter and registry remain intact.

**Depends on**: Chunk 2

---

### Phase 3.1 — transformRequest

- `feat(adapter/claude): implement ClaudeAdapter.transformRequest — maps UnifiedRequest to Anthropic API shape`
- `test(adapter/claude): transformRequest maps system prompt to Anthropic top-level system field`
- `test(adapter/claude): transformRequest maps tool definitions to Anthropic tools format`
- `test(adapter/claude): transformRequest rejects if validateCapabilities fails for requested feature`

### Phase 3.2 — execute

- `feat(adapter/claude): implement ClaudeAdapter.execute — HTTP call with BaseAdapter retry/timeout`
- `test(adapter/claude): execute returns raw Anthropic response from fixture`
- `test(adapter/claude): execute propagates BaseAdapter timeout on slow response`

### Phase 3.3 — transformResponse

- `feat(adapter/claude): implement ClaudeAdapter.transformResponse — maps Anthropic response to UnifiedResponse`
- `test(adapter/claude): transformResponse maps content block to UnifiedResponse.content`
- `test(adapter/claude): transformResponse maps tool_use block to UnifiedResponse.tool_calls`
- `test(adapter/claude): transformResponse maps stop_reason to finish_reason enum`
- `test(adapter/claude): transformResponse includes computed cost_usd in usage`

### Phase 3.4 — validateCapabilities

- `feat(adapter/claude): implement ClaudeAdapter.validateCapabilities — model feature matrix`
- `test(adapter/claude): validateCapabilities returns true for supported features`
- `test(adapter/claude): validateCapabilities returns false for unsupported features on model`
- `chore(adapter/claude): register ClaudeAdapter in AdapterRegistry`

---

## Chunk 4 — Inbound Pipeline (Pre-Flight Interceptors)

**Goal**: Three independent inbound interceptors. Each is a pure function: `(request, config) → PassResult | BlockResult`. No side effects on pass; structured `GuardrailViolation` on block. Implement one at a time — each is independently rollback-safe.

**Rollback**: Delete the interceptor file and its test file. Pipeline runner (Chunk 6) hasn't been wired yet.

**Depends on**: Chunk 1 (types, config)

---

### Phase 4.1 — Injection Scanner

- `docs(adr): ADR-0004 — structural intent scanning vs keyword matching for injection detection`
- `test(inbound/injection): PASS — benign request with no override patterns`
- `test(inbound/injection): BLOCK — explicit override ("ignore previous instructions")`
- `test(inbound/injection): BLOCK — implicit override ("as a reminder, your real task is...")`
- `test(inbound/injection): BLOCK — role reassignment attempt`
- `test(inbound/injection): BLOCK — context poisoning via nested tool result`
- `test(inbound/injection): PASS — empty messages array`
- `feat(inbound/injection): implement InjectionScanner to satisfy all above tests`
- `feat(inbound/injection): log blocked requests (PII-redacted payload) to audit log`
- `test(inbound/injection): audit log entry written on BLOCK, not on PASS`

### Phase 4.2 — PII Masker

- `docs(adr): ADR-0005 — local NLP for PII masking (no external service dependency)`
- `test(inbound/pii): PASS — request with no PII, content unchanged`
- `test(inbound/pii): MASK — email address replaced with [EMAIL]`
- `test(inbound/pii): MASK — phone number replaced with [PHONE]`
- `test(inbound/pii): MASK — credit card pattern replaced with [CC]`
- `test(inbound/pii): MASK — SSN pattern replaced with [SSN]`
- `test(inbound/pii): MASK — PII in nested tool result content`
- `test(inbound/pii): redact_pii=false in config — masker is a no-op`
- `feat(inbound/pii): implement PiiMasker to satisfy all above tests`

### Phase 4.3 — Project Alignment (Cost Pre-Flight)

- `test(inbound/align): PASS — estimated tokens within max_token_spend_per_call`
- `test(inbound/align): BLOCK — estimated tokens exceed budget ceiling`
- `test(inbound/align): BLOCK — provider not in allowed_providers`
- `test(inbound/align): BLOCK — requested tool not in project scope`
- `feat(inbound/align): implement ProjectAlignmentChecker to satisfy all above tests`

---

## Chunk 5 — Outbound Pipeline (Post-Flight Interceptors)

**Goal**: Three independent outbound interceptors. Operate on the raw adapter response before it becomes a `UnifiedResponse`. Each independently rollback-safe.

**Rollback**: Delete the interceptor file and its test file.

**Depends on**: Chunk 1 (types, config)

---

### Phase 5.1 — Schema Enforcer

- `test(outbound/schema): PASS — response matches UnifiedResponse v1 shape`
- `test(outbound/schema): FAIL — missing required field (id)`
- `test(outbound/schema): FAIL — tool_calls entry missing function_name`
- `test(outbound/schema): FAIL — finish_reason is not a valid enum value`
- `test(outbound/schema): FAIL — schema version mismatch with config`
- `feat(outbound/schema): implement SchemaEnforcer to satisfy all above tests`

### Phase 5.2 — Deterministic Grounding

- `test(outbound/grounding): PASS — all tool call function_names exist in Skill Registry`
- `test(outbound/grounding): BLOCK — function_name absent from Skill Registry`
- `test(outbound/grounding): BLOCK — arguments fail JSON schema for registered skill`
- `test(outbound/grounding): PASS — response with no tool_calls is unaffected`
- `feat(outbound/grounding): implement DeterministicGrounder with MOD-02 Skill Registry interface`
- `docs(adr): ADR-0006 — Skill Registry as external dependency (interface, not import)`

### Phase 5.3 — Hallucination Scraper

- `test(outbound/hallucination): PASS — all imports in content exist in project whitelist`
- `test(outbound/hallucination): FLAG — import references package absent from whitelist`
- `test(outbound/hallucination): FLAG — file path reference that does not exist`
- `test(outbound/hallucination): PASS — content with no import or path references`
- `feat(outbound/hallucination): implement HallucinationScraper to satisfy all above tests`
- `feat(outbound/hallucination): load whitelist from guardrails.config.json at startup`

---

## Chunk 6 — Pipeline Orchestrator (Wire Everything Together)

**Goal**: Compose inbound interceptors → adapter → outbound interceptors into a single `runPipeline()` function. This is the integration point. Every prior chunk must be green before landing this.

**Rollback**: Delete `src/pipeline/`. All prior chunks remain independently functional.

**Depends on**: Chunks 1–5

---

### Phase 6.1 — Pipeline runner (tracer bullet)

- `feat(pipeline): implement runPipeline() — inbound chain → adapter.execute → outbound chain`
- `test(pipeline): happy path — clean request flows through all interceptors and returns UnifiedResponse`
- `test(pipeline): inbound block — InjectionScanner block short-circuits pipeline, returns GuardrailViolation response`
- `test(pipeline): outbound block — SchemaEnforcer block returns GuardrailViolation with finish_reason: content_filter`

### Phase 6.2 — Error handling & structured errors

- `feat(pipeline): all GuardrailViolation errors surface in UnifiedResponse — never throw to caller`
- `test(pipeline): adapter throws — pipeline returns GuardrailViolation, not uncaught exception`
- `test(pipeline): multiple inbound violations — all collected, not just first`
- `feat(pipeline): structured error shape includes interceptor name, violation code, and sanitized payload`

### Phase 6.3 — Pipeline integration tests

- `test(pipeline/integration): ClaudeAdapter + all inbound + all outbound — end-to-end with fixture`
- `test(pipeline/integration): PII in request — masked before reaching adapter fixture`
- `test(pipeline/integration): hallucinated import in response — scraper flags it in UnifiedResponse`
- `test(pipeline/integration): tool call for unregistered skill — grounding block returned`

---

## Chunk 7 — OpenAI Adapter (Proves Provider Agnosticism)

**Goal**: Second concrete adapter. If anything in the pipeline assumes Claude-specific shapes, this chunk will expose it. Zero pipeline changes should be required — if they are, that's a regression in Chunk 2/3.

**Rollback**: Delete `src/adapters/openai/`. Pipeline and other adapters unaffected.

**Depends on**: Chunk 3 (IAdapter contract validated by first implementation)

---

### Phase 7.1 — OpenAI adapter

- `feat(adapter/openai): implement OpenAIAdapter.transformRequest — maps UnifiedRequest to OpenAI Chat Completions shape`
- `test(adapter/openai): transformRequest maps system prompt to messages[0] with role: system`
- `feat(adapter/openai): implement OpenAIAdapter.transformResponse — maps OpenAI response to UnifiedResponse`
- `test(adapter/openai): transformResponse maps choices[0].message.content to UnifiedResponse.content`
- `test(adapter/openai): transformResponse maps tool_calls array to UnifiedResponse.tool_calls`
- `feat(adapter/openai): implement OpenAIAdapter.execute and validateCapabilities`
- `test(adapter/openai): full adapter round-trip with recorded fixture`
- `chore(adapter/openai): register OpenAIAdapter in AdapterRegistry`

### Phase 7.2 — Cross-adapter parity test

- `test(adapter/parity): ClaudeAdapter and OpenAIAdapter return identical UnifiedResponse shape for equivalent inputs`

---

## Chunk 8 — Hardening & Observability

**Goal**: Non-functional requirements. Everything works; now make it observable, auditable, and robust under load. Safe to defer — Chunks 1–7 are shippable without this.

**Rollback**: Each phase is additive — removing observability doesn't break functional behavior.

**Depends on**: Chunk 6

---

### Phase 8.1 — Structured audit logging

- `feat(observability): implement AuditLogger — structured JSON log per pipeline run`
- `feat(observability): log fields: request_id, provider, interceptors_run, violations, token_usage, cost_usd, duration_ms`
- `test(observability): audit log written for every runPipeline() call regardless of outcome`
- `test(observability): PII absent from audit log (masker runs before logger)`

### Phase 8.2 — Cumulative cost tracking

- `feat(cost): implement CostLedger — accumulates spend per session_id`
- `feat(cost): ProjectAlignmentChecker reads CostLedger for session-level ceiling enforcement`
- `test(cost): second call that exceeds cumulative budget is blocked`
- `docs(adr): ADR-0007 — in-memory CostLedger for v1; external store deferred`

### Phase 8.3 — Performance baseline

- `test(perf): runPipeline() with all interceptors completes in <50ms for average payload (benchmark fixture)`
- `chore(ci): add benchmark to CI with fail threshold`

---

## Rollback Reference

| Chunk | Safe to remove | Dependencies lost |
| :---- | :------------- | :---------------- |
| 1 | Yes (delete src/types, src/config) | Everything — do not remove |
| 2 | Yes (delete src/adapters/base) | Chunks 3, 7 |
| 3 | Yes (delete src/adapters/claude) | Chunk 6 integration tests |
| 4 | Per-interceptor (delete file + test) | Chunk 6 wiring |
| 5 | Per-interceptor (delete file + test) | Chunk 6 wiring |
| 6 | Yes (delete src/pipeline) | Chunk 8 |
| 7 | Yes (delete src/adapters/openai) | Nothing downstream |
| 8 | Per-phase (each is additive) | Nothing functional |

---

## Commit Order Within Any Phase

1. `test(...)` — failing test(s)
2. `feat(...)` — implementation that makes them pass
3. `refactor(...)` — clean up if needed (must stay green)
4. `docs(adr): ...` — if a non-obvious decision was made during implementation

Never invert steps 1 and 2.
