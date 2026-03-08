# CLAUDE.md — franken-governor / MOD-07: Human-in-the-Loop & Governance

## Project

**Module:** MOD-07 (HITL & Governance — The Safety Valve)
**Package:** `@franken/governor`
**Role:** Pauses agent execution for human approval on high-stakes actions. Ensures deployments, destructive operations, and high-cost tasks never execute without explicit human ACK.

**Integrates with:**
- **MOD-05** (`@frankenbeast/observer`) — Budget breach detection via `CircuitBreaker`
- **MOD-02** (`@franken/skills`) — Skill gating via `requires_hitl` flag
- **MOD-04** (`franken-planner`) — Implements `SelfCritiqueModule` interface for rationale verification
- **MOD-03** (`@franken/brain`) — Audit trail via `EpisodicTrace` logging

---

## Tech Stack

| Concern        | Choice                              | ADR     |
|----------------|-------------------------------------|---------|
| Language       | TypeScript 5.x (strict mode, ESM)   | ADR-001 |
| Runtime        | Node.js 20+                         | ADR-001 |
| Module         | NodeNext resolution                 | ADR-001 |
| Test runner    | Vitest                              | ADR-001 |
| Build          | tsc                                 | ADR-001 |
| Package mgr    | npm                                 |         |

---

## Directory Structure

```text
src/
  core/        Core types (ApprovalRequest, ResponseCode, etc.) and config
  errors/      GovernorError hierarchy (timeout, channel, signature, trigger)
  triggers/    TriggerEvaluator<T> interface + Budget/Skill/Confidence/Ambiguity evaluators
  gateway/     ApprovalGateway orchestrator, ApprovalChannel interface, SelfCritiqueModule adapter
  channels/    Concrete channel adapters (CLI, Slack)
  audit/       GovernorMemoryPort interface + AuditRecorder (EpisodicTrace mapping)
  security/    SignatureVerifier (HMAC-SHA256), SessionToken, SessionTokenStore
  index.ts     Public barrel export

tests/
  unit/        No I/O; injected fakes for all channels and stores
  integration/ Full approval flow tests with real classes, fake I/O

docs/
  adr/         Architecture Decision Records (read before touching related code)
```

---

## Key Commands

```bash
npm test                  # run all unit tests
npm run test:watch        # watch mode (use during TDD cycles)
npm run test:coverage     # unit + coverage report (gates: lines >= 80%, branches >= 80%)
npm run test:integration  # integration tests
npm run typecheck         # tsc --noEmit
npm run build             # tsc -> dist/
```

---

## Architecture Decision Records

All decisions are in `docs/adr/`. **Read the relevant ADR before changing the code it governs.**

| ADR     | Decision                                    | Key rule                                                    |
|---------|---------------------------------------------|-------------------------------------------------------------|
| ADR-001 | TypeScript strict + NodeNext                | `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` on  |
| ADR-002 | Approval channel strategy pattern           | New channels implement `ApprovalChannel`; gateway is unaware |
| ADR-003 | Composable trigger evaluators               | Each trigger is stateless, independently testable            |
| ADR-004 | Audit trail via EpisodicTrace to MOD-03     | `GovernorMemoryPort` interface; tags for learning patterns   |
| ADR-005 | Signed approvals with HMAC-SHA256           | Optional; enabled via `config.requireSignedApprovals`        |
| ADR-006 | Custom error hierarchy                      | `GovernorError` base with `Object.setPrototypeOf`            |
| ADR-007 | Session token activation model              | Scoped tokens with TTL, granted on APPROVE                   |

**Adding a new ADR:** copy an existing ADR, increment the number, link it from this table.

---

## Git Workflow

### Branch Naming

```text
feat/gov-<nn>-<slug>
fix/<short-description>
refactor/<short-description>
docs/adr-<number>-<short-title>
```

### Commit Message Format

```text
<type>(<scope>): <subject>
```

**Types:** `feat`, `fix`, `test`, `refactor`, `docs`, `chore`, `perf`, `ci`

**Scopes:** `scaffold`, `core`, `errors`, `triggers`, `gateway`, `channels`, `audit`, `security`, `integration`

**Examples:**

```text
test(triggers): add failing tests for BudgetTrigger
feat(triggers): implement BudgetTrigger evaluator
refactor(gateway): extract timeout logic to helper
docs(adr): ADR-003 composable trigger evaluators
```

### PR Contract

- **Max ~400 lines changed** per PR
- PR title: `[MOD-07] <type>: <short description>`
- Every PR must contain at least one commit with failing tests before the implementation commit
- Link the governing ADR in the PR description when making architectural changes

---

## TDD Cycle

Follow Red-Green-Refactor strictly. Each cycle <= 10 minutes.

1. **RED** — write one failing test in `tests/unit/`
2. **GREEN** — write minimum code in `src/` to pass it
3. **REFACTOR** — improve code quality; all tests stay green
4. **COMMIT** — atomic commit after each green step

**Test isolation rules:**

- Unit tests: inject fakes for all I/O (no real Slack, no real readline, no real MOD-03)
- Integration tests: use real classes with fake I/O adapters; tag with `@integration`
- Never `new Dependency()` inside the class under test — always inject dependencies
- Fake builder pattern: `function makeX(overrides: Partial<X> = {}): X`

---

## Definition of Done

A phase is complete when:

- [ ] All `tests/unit/` tests pass (`npm test`)
- [ ] `npm run typecheck` exits 0
- [ ] `npm run build` has no errors
- [ ] Coverage thresholds pass (`npm run test:coverage`)
- [ ] PR is self-reviewed with a clear description of *why*
- [ ] No `console.log` in `src/` (use structured logging or events)
- [ ] Governing ADR exists and is linked in the PR

---

## Module Interfaces (for other modules)

### What MOD-07 exports (`src/index.ts`)

```typescript
// Primary API
export { GovernorCritiqueAdapter } from './gateway/index.js';
export { createGovernor } from './gateway/index.js';

// Types (for MOD-04 Planner and orchestrator)
export type {
  ResponseCode,
  ApprovalRequest,
  ApprovalResponse,
  ApprovalOutcome,
  SessionToken,
  GovernorConfig,
  TriggerEvaluator,
  ApprovalChannel,
  GovernorMemoryPort,
} from './core/index.js';
```

### MOD-04 (Planner) integration

- `GovernorCritiqueAdapter` implements `SelfCritiqueModule` from `franken-planner/src/modules/mod07.ts`
- Planner calls `verifyRationale(rationale)` before every task execution
- Returns `{ verdict: 'approved' }` or `{ verdict: 'rejected', reason }` after human review

### MOD-05 (Observer) integration

- `BudgetTrigger` evaluates `CircuitBreakerResult` from `@frankenbeast/observer`
- Register handler on `CircuitBreaker.on('limit-reached', ...)` to trigger HITL pause

### MOD-03 (Memory) integration

- `AuditRecorder` logs every decision as `EpisodicTrace` via `GovernorMemoryPort`
- Tags: `hitl:approved`, `hitl:rejected`, `hitl:preferred-pattern`, `hitl:rejection-reason`

---

## Installed Rule Templates

| Template             | Purpose                                                              |
|----------------------|----------------------------------------------------------------------|
| **Shared**           | Core principles, code quality, security, git workflow, communication |
| **javascript-expert**| Principal-level TypeScript/Node.js patterns                          |
| **web-backend**      | API design, error handling, authentication, database patterns        |
| **devops-sre**       | DevOps and SRE practices, observability, incident management         |
| **qa-engineering**   | Quality assurance, quality gates, test strategy                      |
| **testing**          | TDD, test design, CI/CD integration, coverage metrics                |

All rules are in `.cursor/rules/`. Re-run to update:

```bash
npx @djm204/agent-skills javascript-expert web-backend devops-sre qa-engineering testing
```
