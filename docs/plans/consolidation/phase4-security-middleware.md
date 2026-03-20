# Phase 4: Security Middleware — Absorb Firewall + Configurable Profiles

**Goal:** Input validation and output filtering live as middleware in the orchestrator, not a separate package. Security is first-class but configurable via three profiles (strict/standard/permissive).

**Dependencies:** Phase 1 (frankenfirewall deleted, need to extract useful logic from git history)

**Why this matters:** Every LLM call passes through the middleware chain. Without it, there's no injection detection, no PII masking, and no output validation. The profiles make security configurable without being either "all or nothing."

---

## Design

### Middleware Chain

```
Request → InjectionDetection → PiiMasking → [LLM Call] → OutputValidation → Response
```

Each middleware implements `LlmMiddleware`:
```typescript
interface LlmMiddleware {
  beforeRequest(request: LlmRequest): LlmRequest;
  afterResponse(response: LlmResponse): LlmResponse;
}
```

The middleware chain runs synchronously before and after every LLM call. Middleware can modify the request/response or throw to block execution.

### Security Profiles

| Setting | `strict` | `standard` | `permissive` |
|---------|----------|------------|--------------|
| Injection detection | On | On | Off |
| PII masking | On | On | Off |
| Output validation | On | On | On |
| Domain allowlist | Required | Optional | Off |
| Token budget | Enforced | Enforced | Optional |
| HITL approval | All actions | Destructive only | None |

Profiles are a base — individual settings can be overridden per-run via config or dashboard.

## Success Criteria

- `LlmMiddleware` interface with `beforeRequest`/`afterResponse`
- Three concrete middleware: injection detection, PII masking, output validation
- Three security profiles with per-setting override
- API routes for security config (GET + PATCH)
- Middleware chain runs on every LLM call
- Existing firewall test coverage migrated or replaced

## Chunks

| # | Chunk | Committable Unit |
|---|-------|-----------------|
| 01 | [Extract firewall logic](phase4-security-middleware/01_extract-firewall-logic.md) | Pull patterns from git history |
| 02 | [LLM middleware chain](phase4-security-middleware/02_llm-middleware-chain.md) | `LlmMiddleware` + concrete implementations |
| 03 | [Security profiles + API](phase4-security-middleware/03_security-profiles.md) | `SecurityConfig` + profiles + routes |
| 04 | [Domain allowlist](phase4-security-middleware/04_domain-allowlist.md) | `DomainAllowlistMiddleware` + profile integration |

**Execution:** Sequential — 01 informs 02, 02 informs 03, 03 informs 04.
