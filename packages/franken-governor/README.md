# @franken/governor

**MOD-07: Human-in-the-Loop (HITL) & Governance** for the Frankenbeast AI agent orchestrator.

The Governor is the safety valve of the Frankenbeast system. It pauses agent execution for human approval on high-stakes actions — budget breaches, destructive skills, low-confidence plans, and ambiguity. The agent cannot execute gated operations without an explicit human ACK.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Trigger Evaluators](#trigger-evaluators)
- [Approval Channels](#approval-channels)
- [Approval Gateway](#approval-gateway)
- [Audit Trail](#audit-trail)
- [Security](#security)
- [Configuration](#configuration)
- [Integration with Sibling Modules](#integration-with-sibling-modules)
- [API Reference](#api-reference)
- [Testing](#testing)
- [Architecture Decision Records](#architecture-decision-records)

## Installation

```bash
npm install @franken/governor
```

Requires Node.js >= 20.

## Quick Start

The fastest way to get a working governor is the `createGovernor` factory:

```typescript
import { createGovernor, BudgetTrigger, SkillTrigger } from '@franken/governor';
import * as readline from 'node:readline/promises';

// Create a readline interface (or use your own adapter)
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const readlineAdapter = { question: (prompt: string) => rl.question(prompt) };

// Wire up the governor with triggers
const governor = createGovernor({
  readline: readlineAdapter,
  memoryPort: { recordDecision: async (trace) => console.log('Audit:', trace) },
  evaluators: [new BudgetTrigger(), new SkillTrigger()],
  projectId: 'my-project',
  operatorName: 'alice',
});

// Verify a rationale before the agent executes
const result = await governor.verifyRationale({
  taskId: 'task-001',
  reasoning: 'Deploy to production',
  selectedTool: 'deploy-prod',
  expectedOutcome: 'Application is live on prod servers',
  timestamp: new Date(),
});

if (result.verdict === 'approved') {
  console.log('Proceeding with execution');
} else {
  console.log('Blocked:', result.reason);
}

rl.close();
```

## Architecture

```
┌─────────────────────────────────────────────────┐
│                GovernorCritiqueAdapter           │
│         (SelfCritiqueModule interface)           │
│                                                  │
│   RationaleBlock ──► TriggerEvaluators           │
│                          │                       │
│                    triggered?                     │
│                     │      │                     │
│                    no      yes                   │
│                     │      │                     │
│                  approved  ▼                     │
│                      ApprovalGateway             │
│                          │                       │
│              ┌───────────┼───────────┐           │
│              ▼           ▼           ▼           │
│          CliChannel  SlackChannel  (custom)      │
│              │           │           │           │
│              └───────────┼───────────┘           │
│                          ▼                       │
│                    AuditRecorder                  │
│                          │                       │
│                          ▼                       │
│                   GovernorMemoryPort             │
│                     (→ MOD-03)                   │
└─────────────────────────────────────────────────┘
```

The module follows hexagonal architecture with dependency injection at every boundary:

- **Triggers** are stateless evaluators — no I/O, purely functional
- **Channels** are the Strategy pattern — swap CLI for Slack (or both) without touching the gateway
- **Audit** records every decision through a port interface compatible with MOD-03 (franken-brain)
- **Security** layer adds optional HMAC-SHA256 signed approvals and session tokens

## Trigger Evaluators

Triggers determine whether a rationale requires human approval. Each trigger is a stateless class implementing the `TriggerEvaluator<TContext>` interface.

### BudgetTrigger

Fires when the cost circuit breaker from MOD-05 (franken-observer) trips.

```typescript
import { BudgetTrigger, type BudgetTriggerContext } from '@franken/governor';

const trigger = new BudgetTrigger();

const result = trigger.evaluate({
  tripped: true,
  limitUsd: 50,
  spendUsd: 52.30,
});
// → { triggered: true, triggerId: 'budget', severity: 'critical',
//    reason: 'Budget breach: spent $52.3 exceeds limit $50' }
```

| Field | Type | Description |
|-------|------|-------------|
| `tripped` | `boolean` | Whether the circuit breaker has tripped |
| `limitUsd` | `number` | Budget limit in USD |
| `spendUsd` | `number` | Current spend in USD |

Severity: **critical**

### SkillTrigger

Fires when a skill from MOD-02 (franken-skills) is marked as requiring HITL or is destructive.

```typescript
import { SkillTrigger, type SkillTriggerContext } from '@franken/governor';

const trigger = new SkillTrigger();

const result = trigger.evaluate({
  skillId: 'delete-database',
  requiresHitl: true,
  isDestructive: true,
});
// → { triggered: true, triggerId: 'skill', severity: 'high',
//    reason: "Skill 'delete-database' requires HITL and is destructive" }
```

| Field | Type | Description |
|-------|------|-------------|
| `skillId` | `string` | Identifier of the skill being invoked |
| `requiresHitl` | `boolean` | Skill's `constraints.requires_hitl` flag |
| `isDestructive` | `boolean` | Whether the skill performs destructive operations |

Severity: **high**

### ConfidenceTrigger

Fires when a plan's confidence score (from MOD-06) falls below a configurable threshold.

```typescript
import { ConfidenceTrigger, type ConfidenceTriggerContext } from '@franken/governor';

// Default threshold: 0.5
const trigger = new ConfidenceTrigger();

// Custom threshold
const strictTrigger = new ConfidenceTrigger(0.8);

const result = trigger.evaluate({ confidenceScore: 0.35 });
// → { triggered: true, triggerId: 'confidence', severity: 'medium',
//    reason: 'Low confidence: score 0.35 below threshold 0.5' }
```

| Field | Type | Description |
|-------|------|-------------|
| `confidenceScore` | `number` | Plan confidence score (0–1) |

Severity: **medium**

### AmbiguityTrigger

Fires when the planner detects unresolved dependencies or ADR conflicts.

```typescript
import { AmbiguityTrigger, type AmbiguityTriggerContext } from '@franken/governor';

const trigger = new AmbiguityTrigger();

const result = trigger.evaluate({
  hasUnresolvedDependency: true,
  hasAdrConflict: false,
});
// → { triggered: true, triggerId: 'ambiguity', severity: 'high',
//    reason: 'Ambiguity detected: unresolved dependency' }
```

| Field | Type | Description |
|-------|------|-------------|
| `hasUnresolvedDependency` | `boolean` | Plan has unresolved dependencies |
| `hasAdrConflict` | `boolean` | Plan conflicts with an ADR |

Severity: **high**

### TriggerRegistry

Compose multiple triggers into a registry that short-circuits on the first match:

```typescript
import {
  TriggerRegistry,
  BudgetTrigger,
  SkillTrigger,
  ConfidenceTrigger,
  AmbiguityTrigger,
} from '@franken/governor';

const registry = new TriggerRegistry([
  new BudgetTrigger(),
  new SkillTrigger(),
  new ConfidenceTrigger(0.6),
  new AmbiguityTrigger(),
]);

// Evaluates each trigger in order, returns the first triggered result
const result = registry.evaluateAll(context);
```

### Custom Triggers

Implement the `TriggerEvaluator` interface to add project-specific triggers:

```typescript
import type { TriggerEvaluator, TriggerResult } from '@franken/governor';

interface TokenCountContext {
  readonly tokenCount: number;
  readonly maxTokens: number;
}

class TokenLimitTrigger implements TriggerEvaluator<TokenCountContext> {
  readonly triggerId = 'token-limit';

  evaluate(context: TokenCountContext): TriggerResult {
    if (context.tokenCount <= context.maxTokens) {
      return { triggered: false, triggerId: this.triggerId };
    }

    return {
      triggered: true,
      triggerId: this.triggerId,
      reason: `Token count ${context.tokenCount} exceeds max ${context.maxTokens}`,
      severity: 'high',
    };
  }
}
```

## Approval Channels

Channels handle the actual human interaction. They implement the `ApprovalChannel` interface.

### CliChannel

Interactive terminal prompts. The operator sees a formatted summary and responds with single-key shortcuts.

```typescript
import { CliChannel, type ReadlineAdapter } from '@franken/governor';
import * as readline from 'node:readline/promises';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const channel = new CliChannel({
  readline: { question: (prompt: string) => rl.question(prompt) },
  operatorName: 'alice',
});
```

The CLI prompt looks like:

```
--- HITL Approval Required ---
Task: task-001
Trigger: [budget] Budget breach: spent $52.3 exceeds limit $50
Summary: Deploy to production → Application is live

[a]pprove  [r]egenerate  a[x]bort  [d]ebug
>
```

Key mappings:

| Key | Response Code | Description |
|-----|--------------|-------------|
| `a` | `APPROVE` | Approve the action, agent proceeds |
| `r` | `REGEN` | Reject and request regeneration (prompts for feedback) |
| `x` | `ABORT` | Abort the action entirely |
| `d` | `DEBUG` | Approve in debug/inspect mode |

### SlackChannel

Sends approval requests via Slack webhook and listens for interactive callbacks.

```typescript
import { SlackChannel, type HttpClient, type SlackCallbackServer } from '@franken/governor';

const channel = new SlackChannel({
  webhookUrl: 'https://hooks.slack.com/services/T00/B00/XXX',
  httpClient: myHttpClient,       // implements { post(url, body): Promise<{ ok: boolean }> }
  callbackServer: myCallbackSvr,  // implements { waitForCallback(requestId): Promise<callback> }
});
```

The `HttpClient` and `SlackCallbackServer` are injected interfaces — bring your own HTTP library and callback server implementation.

### Custom Channels

Implement `ApprovalChannel` to add any approval mechanism (email, web UI, mobile push, etc.):

```typescript
import type { ApprovalChannel, ApprovalRequest, ApprovalResponse } from '@franken/governor';

class EmailChannel implements ApprovalChannel {
  readonly channelId = 'email';

  async requestApproval(request: ApprovalRequest): Promise<ApprovalResponse> {
    // Send email, wait for response, return ApprovalResponse
  }
}
```

## Approval Gateway

The `ApprovalGateway` orchestrates the full approval flow: channel interaction, optional signature verification, audit recording, and session token creation.

```typescript
import { ApprovalGateway, GovernorAuditRecorder, CliChannel } from '@franken/governor';
import { defaultConfig } from '@franken/governor';

const gateway = new ApprovalGateway({
  channel: cliChannel,
  auditRecorder: auditRecorder,
  config: defaultConfig(),
  // Optional:
  signatureVerifier: verifier,
  sessionTokenStore: tokenStore,
});

const outcome = await gateway.requestApproval(approvalRequest);

switch (outcome.decision) {
  case 'APPROVE':
    // outcome.token is set if sessionTokenStore was provided
    break;
  case 'REGEN':
    // outcome.feedback contains the operator's feedback
    break;
  case 'ABORT':
    // outcome.reason may contain the abort reason
    break;
  case 'DEBUG':
    // Proceed in debug mode
    break;
}
```

Features:
- **Timeout**: Throws `ApprovalTimeoutError` if no response within `config.timeoutMs` (default: 5 min)
- **Signature verification**: Optionally validates HMAC-SHA256 signatures on responses
- **Session tokens**: Optionally creates scoped, time-limited tokens on APPROVE
- **Audit**: Records every decision via the `AuditRecorder` interface

## Audit Trail

Every approval decision is recorded as an `EpisodicTraceRecord` compatible with MOD-03 (franken-brain).

```typescript
import { GovernorAuditRecorder, type GovernorMemoryPort } from '@franken/governor';

// Implement the port for your memory backend
const memoryPort: GovernorMemoryPort = {
  recordDecision: async (trace) => {
    // trace.tags includes semantic tags for querying:
    //   APPROVE → ['hitl', 'hitl:approved', 'hitl:preferred-pattern']
    //   REGEN   → ['hitl', 'hitl:rejected', 'hitl:rejection-reason']
    //   ABORT   → ['hitl', 'hitl:aborted']
    //   DEBUG   → ['hitl', 'hitl:debug']
    await myDatabase.insert(trace);
  },
};

const recorder = new GovernorAuditRecorder(memoryPort);
```

The `EpisodicTraceRecord` shape:

```typescript
interface EpisodicTraceRecord {
  readonly id: string;           // Same as the approval requestId
  readonly type: 'episodic';
  readonly projectId: string;
  readonly status: 'success' | 'failure';  // APPROVE/DEBUG = success, REGEN/ABORT = failure
  readonly createdAt: number;    // Unix timestamp
  readonly taskId: string;
  readonly toolName: string;     // Always 'hitl-gateway'
  readonly input: unknown;       // Trigger details
  readonly output: unknown;      // Decision details
  readonly tags: string[];       // Semantic tags for querying
}
```

## Security

### Signed Approvals (HMAC-SHA256)

Enable cryptographic verification of approval responses to prevent tampering:

```typescript
import { SignatureVerifier } from '@franken/governor';

const secret = process.env.GOVERNOR_SIGNING_SECRET!;
const verifier = new SignatureVerifier(secret);

// Sign a payload
const payload = JSON.stringify({ requestId: 'abc', decision: 'APPROVE' });
const signature = verifier.sign(payload);

// Verify (timing-safe comparison)
const isValid = verifier.verify(payload, signature);
```

To enable in the gateway:

```typescript
const gateway = new ApprovalGateway({
  channel,
  auditRecorder,
  config: {
    ...defaultConfig(),
    requireSignedApprovals: true,
  },
  signatureVerifier: new SignatureVerifier(secret),
});
```

When `requireSignedApprovals` is `true`, the gateway throws `SignatureVerificationError` if a response has an invalid or missing signature.

### Session Tokens

On APPROVE, the gateway can issue a scoped, time-limited `SessionToken` — the agent must present this token to invoke the approved skill:

```typescript
import { SessionTokenStore, createSessionToken } from '@franken/governor';

const store = new SessionTokenStore();

// Tokens are created automatically by ApprovalGateway when sessionTokenStore is provided
const gateway = new ApprovalGateway({
  channel,
  auditRecorder,
  config: defaultConfig(), // sessionTokenTtlMs: 3_600_000 (1 hour)
  sessionTokenStore: store,
});

const outcome = await gateway.requestApproval(request);
if (outcome.decision === 'APPROVE' && outcome.token) {
  // Later, verify the token before executing
  if (store.isValid(outcome.token.tokenId)) {
    // Proceed — token is valid and not expired
  }

  // Revoke when done
  store.revoke(outcome.token.tokenId);
}
```

`SessionToken` fields:

| Field | Type | Description |
|-------|------|-------------|
| `tokenId` | `string` | Unique identifier (UUID) |
| `approvalId` | `string` | The approval request ID that created this token |
| `scope` | `string` | Skill ID or task ID this token authorizes |
| `grantedBy` | `string` | Operator who approved |
| `grantedAt` | `Date` | When the token was issued |
| `expiresAt` | `Date` | When the token expires |

Expired tokens are automatically cleaned up on access.

## Configuration

```typescript
import { defaultConfig, type GovernorConfig } from '@franken/governor';

const config: GovernorConfig = {
  timeoutMs: 300_000,             // 5 minutes — approval request timeout
  requireSignedApprovals: false,   // Enable HMAC-SHA256 verification
  operatorName: 'operator',        // Default operator name for CLI channel
  sessionTokenTtlMs: 3_600_000,   // 1 hour — session token TTL
  signingSecret: undefined,        // HMAC-SHA256 shared secret
};
```

## Integration with Sibling Modules

### MOD-04: franken-planner (SelfCritiqueModule)

`GovernorCritiqueAdapter` implements the `SelfCritiqueModule` interface from franken-planner:

```typescript
import { createGovernor, BudgetTrigger, SkillTrigger } from '@franken/governor';

// In your planner setup:
const governor = createGovernor({
  readline: readlineAdapter,
  memoryPort: memoryOrchestrator, // From MOD-03
  evaluators: [new BudgetTrigger(), new SkillTrigger()],
  projectId: 'my-project',
});

// The planner calls verifyRationale() before executing each step
const result = await governor.verifyRationale({
  taskId: 'task-001',
  reasoning: 'Need to delete old deployment',
  selectedTool: 'delete-deployment',
  expectedOutcome: 'Old deployment removed',
  timestamp: new Date(),
});
```

### MOD-05: franken-observer (Budget Gating)

Feed `CircuitBreakerResult` events into the `BudgetTrigger`:

```typescript
import { BudgetTrigger } from '@franken/governor';

const budgetTrigger = new BudgetTrigger();

// When CircuitBreaker emits 'limit-reached':
circuitBreaker.on('limit-reached', (result) => {
  budgetTrigger.evaluate({
    tripped: result.tripped,
    limitUsd: result.limitUsd,
    spendUsd: result.spendUsd,
  });
});
```

### MOD-02: franken-skills (Skill Gating)

Check `UnifiedSkillContract.constraints` before invoking a skill:

```typescript
import { SkillTrigger } from '@franken/governor';

const skillTrigger = new SkillTrigger();

function shouldGateSkill(contract: UnifiedSkillContract) {
  return skillTrigger.evaluate({
    skillId: contract.id,
    requiresHitl: contract.constraints.requires_hitl,
    isDestructive: contract.constraints.is_destructive ?? false,
  });
}
```

### MOD-03: franken-brain (Audit Logging)

Implement `GovernorMemoryPort` to bridge to the memory orchestrator:

```typescript
import { GovernorAuditRecorder, type GovernorMemoryPort } from '@franken/governor';

const memoryPort: GovernorMemoryPort = {
  recordDecision: async (trace) => {
    await memoryOrchestrator.recordToolResult({
      ...trace,
      // Map to EpisodicTrace shape expected by MOD-03
    });
  },
};

const recorder = new GovernorAuditRecorder(memoryPort);
```

## API Reference

### Exports

#### Classes

| Class | Description |
|-------|-------------|
| `BudgetTrigger` | Evaluates budget circuit breaker state |
| `SkillTrigger` | Evaluates skill HITL/destructive flags |
| `ConfidenceTrigger` | Evaluates plan confidence scores |
| `AmbiguityTrigger` | Evaluates plan ambiguity signals |
| `TriggerRegistry` | Composes multiple evaluators |
| `ApprovalGateway` | Orchestrates the approval flow |
| `GovernorCritiqueAdapter` | SelfCritiqueModule adapter for franken-planner |
| `GovernorAuditRecorder` | Maps decisions to EpisodicTraceRecord |
| `SignatureVerifier` | HMAC-SHA256 sign/verify |
| `SessionTokenStore` | In-memory token store with TTL expiry |
| `CliChannel` | Terminal-based approval channel |
| `SlackChannel` | Slack webhook approval channel |

#### Functions

| Function | Description |
|----------|-------------|
| `createGovernor(options)` | Factory that wires up a complete governor with CLI channel |
| `defaultConfig()` | Returns default `GovernorConfig` |
| `createSessionToken(params)` | Creates a `SessionToken` value object |

#### Interfaces

| Interface | Description |
|-----------|-------------|
| `TriggerEvaluator<T>` | Contract for trigger evaluators |
| `ApprovalChannel` | Contract for approval channels |
| `AuditRecorder` | Contract for audit recording |
| `GovernorMemoryPort` | Hexagonal port for MOD-03 memory integration |
| `ReadlineAdapter` | Minimal readline interface for CLI |
| `HttpClient` | HTTP POST interface for Slack |
| `SlackCallbackServer` | Callback listener interface for Slack |

#### Types

| Type | Description |
|------|-------------|
| `ResponseCode` | `'APPROVE' \| 'REGEN' \| 'ABORT' \| 'DEBUG'` |
| `TriggerSeverity` | `'low' \| 'medium' \| 'high' \| 'critical'` |
| `TriggerResult` | Trigger evaluation output |
| `ApprovalRequest` | Request sent to a channel |
| `ApprovalResponse` | Raw response from a channel |
| `ApprovalOutcome` | Discriminated union of decision outcomes |
| `SessionToken` | Scoped, time-limited authorization token |
| `GovernorConfig` | Module configuration |
| `EpisodicTraceRecord` | Audit trail record shape |

#### Error Classes

| Error | Thrown When |
|-------|------------|
| `GovernorError` | Base class for all governor errors |
| `ApprovalTimeoutError` | No response within `config.timeoutMs` |
| `ChannelUnavailableError` | Channel fails (e.g., Slack webhook down) |
| `SignatureVerificationError` | HMAC signature verification fails |
| `TriggerEvaluationError` | Trigger evaluation throws |

## Testing

```bash
# Run all unit tests
npm test

# Run in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage

# Run integration tests
npm run test:integration

# Type check
npm run typecheck

# Build
npm run build
```

Test structure:

```
tests/
  unit/
    core/              # types, config
    errors/            # error hierarchy
    triggers/          # each trigger + registry
    gateway/           # approval gateway, critique adapter, factory
    channels/          # CLI, Slack
    audit/             # audit recorder
    security/          # signature verifier, session token, token store
  integration/
    full-approval-flow.test.ts   # End-to-end flows
```

All I/O is injected — tests use fakes/mocks, no real network or terminal required.

## Architecture Decision Records

| ADR | Title |
|-----|-------|
| [ADR-001](docs/adr/001-typescript-strict-nodenext.md) | TypeScript Strict + NodeNext Resolution |
| [ADR-002](docs/adr/002-approval-channel-strategy.md) | Approval Channel Strategy Pattern |
| [ADR-003](docs/adr/003-composable-trigger-evaluators.md) | Composable Trigger Evaluators |
| [ADR-004](docs/adr/004-audit-trail-episodic-trace.md) | Audit Trail via EpisodicTrace to MOD-03 |
| [ADR-005](docs/adr/005-signed-approvals-hmac.md) | Signed Approvals with HMAC-SHA256 |
| [ADR-006](docs/adr/006-custom-error-hierarchy.md) | Custom Error Hierarchy |
| [ADR-007](docs/adr/007-session-token-activation.md) | Session Token Activation Model |

## License

UNLICENSED
