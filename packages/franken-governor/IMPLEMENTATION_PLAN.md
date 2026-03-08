# Implementation Plan — franken-governor (MOD-07)

## Phase 1: Scaffold (PR-1)
- Project setup: `package.json`, `tsconfig.json`, `vitest.config.ts`
- Smoke test, `src/index.ts` with VERSION export
- ADR-001, CLAUDE.md

## Phase 2: Core Types & Errors (PR-2)
- `src/core/types.ts` — ResponseCode, ApprovalRequest, ApprovalResponse, ApprovalOutcome, SessionToken
- `src/core/config.ts` — GovernorConfig with defaults
- `src/errors/` — GovernorError base + ApprovalTimeoutError, ChannelUnavailableError, SignatureVerificationError, TriggerEvaluationError
- ADR-006

## Phase 3a: Triggers (PR-3) — parallel with 3b, 3c
- `src/triggers/trigger-evaluator.ts` — TriggerEvaluator<T> interface
- BudgetTrigger (CircuitBreakerResult), SkillTrigger (requires_hitl), ConfidenceTrigger, AmbiguityTrigger
- TriggerRegistry — composable evaluation
- ADR-003

## Phase 3b: Gateway (PR-4) — parallel with 3a, 3c
- `src/gateway/approval-channel.ts` — ApprovalChannel interface
- `src/gateway/approval-gateway.ts` — orchestrates triggers -> channel -> audit -> token
- ADR-002

## Phase 3c: Audit (PR-5) — parallel with 3a, 3b
- `src/audit/governor-memory-port.ts` — GovernorMemoryPort interface
- `src/audit/audit-recorder.ts` — maps decisions to EpisodicTrace with learning tags
- ADR-004

## Phase 4a: Security (PR-6) — after PR-4
- SignatureVerifier (HMAC-SHA256), SessionToken, SessionTokenStore
- Gateway integration for signature checks + token creation
- ADR-005, ADR-007

## Phase 4b: Channels (PR-7) — after PR-4
- CliChannel (readline-based terminal prompts)
- SlackChannel (webhook POST + interactive payload parsing)

## Phase 5: Integration (PR-8) — after all
- GovernorCritiqueAdapter implementing SelfCritiqueModule from franken-planner
- createGovernor() factory function
- Integration tests: full approval flows
