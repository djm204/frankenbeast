# franken-governor Ramp-Up

**`@franken/governor` (MOD-07)** -- Human-in-the-loop gateway that pauses agent execution for human approval on high-stakes actions (budget breaches, destructive skills, low confidence, ambiguity).

## Directory Structure

```
src/
  core/        types.ts (ApprovalRequest, ResponseCode, etc.), config.ts
  errors/      GovernorError hierarchy (timeout, channel, signature, trigger)
  triggers/    TriggerEvaluator<T> interface + 4 built-in triggers + TriggerRegistry
  gateway/     ApprovalGateway, ApprovalChannel interface, GovernorCritiqueAdapter, createGovernor factory
  channels/    CliChannel, SlackChannel (both implement ApprovalChannel)
  audit/       GovernorMemoryPort interface, GovernorAuditRecorder
  security/    SignatureVerifier (HMAC-SHA256), createSessionToken(), SessionTokenStore
  server/      Hono HTTP app (callback server)
  index.ts     Barrel export
tests/
  unit/        Mirror of src/ structure
  integration/ full-approval-flow.test.ts
```

## Public API

### Core Types

```typescript
type ResponseCode = 'APPROVE' | 'REGEN' | 'ABORT' | 'DEBUG';
type TriggerSeverity = 'low' | 'medium' | 'high' | 'critical';

interface TriggerResult { triggered: boolean; triggerId: string; reason?: string; severity?: TriggerSeverity }
interface ApprovalRequest { requestId: string; taskId: string; projectId: string; trigger: TriggerResult; summary: string; planDiff?: string; skillId?: string; timestamp: Date; metadata?: Record<string, unknown> }
interface ApprovalResponse { requestId: string; decision: ResponseCode; feedback?: string; respondedBy: string; respondedAt: Date; signature?: string }

type ApprovalOutcome =
  | { decision: 'APPROVE'; token?: SessionToken }
  | { decision: 'REGEN'; feedback: string }
  | { decision: 'ABORT'; reason?: string }
  | { decision: 'DEBUG' };

interface SessionToken { tokenId: string; approvalId: string; scope: string; grantedBy: string; grantedAt: Date; expiresAt: Date }
interface GovernorConfig { timeoutMs: number; requireSignedApprovals: boolean; operatorName: string; sessionTokenTtlMs: number; signingSecret?: string }
```

### ApprovalGateway

Central orchestrator. Receives an `ApprovalRequest`, delegates to an `ApprovalChannel`, optionally verifies HMAC signature, records audit, and returns `ApprovalOutcome`.

```typescript
class ApprovalGateway {
  constructor(deps: ApprovalGatewayDeps)  // { channel, auditRecorder, config, signatureVerifier?, sessionTokenStore? }
  requestApproval(request: ApprovalRequest): Promise<ApprovalOutcome>
}
```

On `APPROVE` with a `SessionTokenStore` present, it auto-creates and stores a scoped `SessionToken`.

### GovernorCritiqueAdapter

Implements `SelfCritiqueModule` from `@franken/types`. Bridge between the planner's rationale verification and the approval gateway.

```typescript
class GovernorCritiqueAdapter {
  constructor(deps: GovernorCritiqueAdapterDeps)  // { channel, auditRecorder, evaluators, projectId }
  verifyRationale(rationale: RationaleBlock): Promise<VerificationResult>  // { verdict: 'approved' } | { verdict: 'rejected', reason }
}
```

### Factory

```typescript
function createGovernor(options: CreateGovernorOptions): GovernorCritiqueAdapter
// options: { readline, memoryPort, evaluators?, projectId?, operatorName? }
```

## Trigger System

```typescript
interface TriggerEvaluator<TContext = unknown> {
  readonly triggerId: string;
  evaluate(context: TContext): TriggerResult;
}
```

| Trigger | Constructor | Context | Fires when |
|---------|------------|---------|------------|
| `BudgetTrigger` | **parameterless** `new BudgetTrigger()` | `{ tripped, limitUsd, spendUsd }` | `tripped === true` |
| `SkillTrigger` | **parameterless** `new SkillTrigger()` | `{ skillId, requiresHitl, isDestructive }` | either flag true |
| `ConfidenceTrigger` | `new ConfidenceTrigger(threshold=0.5)` | `{ confidenceScore }` | score < threshold |
| `AmbiguityTrigger` | **parameterless** `new AmbiguityTrigger()` | `{ hasUnresolvedDependency, hasAdrConflict }` | either flag true |

### TriggerRegistry

```typescript
class TriggerRegistry {
  constructor(evaluators: ReadonlyArray<TriggerEvaluator>)
  evaluateAll(context: unknown): TriggerResult   // NOT .evaluate()
}
```

Short-circuits on first triggered evaluator; returns `{ triggered: false, triggerId: 'none' }` if none fire.

## Channels

Both implement `ApprovalChannel { channelId: string; requestApproval(req): Promise<ApprovalResponse> }`.

- **CliChannel** -- deps: `{ readline: ReadlineAdapter, operatorName }`. Prompts `[a]pprove [r]egenerate a[x]bort [d]ebug`.
- **SlackChannel** -- deps: `{ webhookUrl, httpClient: HttpClient, callbackServer: SlackCallbackServer }`. Posts webhook, then awaits callback.

## Security

- **SignatureVerifier** -- `new SignatureVerifier(secret)`. Methods: `sign(payload): string`, `verify(payload, signature): boolean`. HMAC-SHA256 with timing-safe comparison.
- **SessionTokenStore** -- in-memory Map with TTL expiry. Methods: `store(token)`, `get(tokenId)`, `revoke(tokenId)`, `isValid(tokenId)`.
- **createSessionToken(params)** -- params: `{ approvalId, scope, grantedBy, ttlMs }`.

## Audit

- **GovernorMemoryPort** -- interface: `recordDecision(trace: EpisodicTraceRecord): Promise<void>`
- **GovernorAuditRecorder** -- implements `AuditRecorder`, maps request+response to `EpisodicTraceRecord` with tags (`hitl:approved`, `hitl:rejected`, etc.)

## Gotchas

1. **`BudgetTrigger()` and `SkillTrigger()` have parameterless constructors.** `AmbiguityTrigger()` also parameterless. Only `ConfidenceTrigger` takes an optional threshold.
2. **`TriggerRegistry.evaluateAll()`** -- the method is `evaluateAll`, not `evaluate`.
3. **`GovernorCritiqueAdapter.verifyRationale()` accepts `RationaleBlock` typed as `unknown` at the trigger level** -- the adapter's internal `evaluateTriggers` passes `rationale` (typed as `RationaleBlock` from `@franken/types`) directly to each evaluator's `evaluate(context: TContext)`, but `TriggerEvaluator` defaults `TContext = unknown`. Callers must cast or use the correct context type.
4. **`defaultConfig()` is a function**, not a constant -- call it to get config.

## Build and Test

```bash
npm test                  # vitest run (unit tests)
npm run test:watch        # vitest watch
npm run test:coverage     # vitest + coverage (lines >= 80%, branches >= 80%)
npm run test:integration  # INTEGRATION=true vitest run
npm run typecheck         # tsc --noEmit
npm run build             # tsc -> dist/
```

## Dependencies

- **Runtime:** `@franken/types` (file:../franken-types), `hono` ^4.7.0
- **Dev:** `typescript` ^5.7, `vitest` ^3.0, `@vitest/coverage-v8` ^3.0, `@types/node` ^25.3
- **Node:** >=20, ESM (`"type": "module"`), NodeNext resolution
