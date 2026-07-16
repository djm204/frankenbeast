# @franken/orchestrator

The Beast Loop product package for Frankenbeast: core orchestration, the `frankenbeast` CLI, issue-to-PR workflows, chat/network serving surfaces, Beast run management, and provider-backed execution.

## Requirements

- Node.js `>=22.13.0 <23 || >=24.0.0 <26`
- Install dependencies from the repository root with `npm install`
- CLI features that call external models require the corresponding provider credentials and local CLI/API configuration

## Public entrypoints

```ts
import { BeastLoop } from '@franken/orchestrator';
```

The package's main public API is its compiled `dist/index.js` export. Most day-to-day usage goes through the CLI binaries.

## CLI binaries

This package publishes three aliases that resolve to the same CLI entrypoint:

| Binary | Purpose |
| --- | --- |
| `frankenbeast` | Canonical CLI. |
| `franken` | Short alias. |
| `frkn` | Compact alias. |

Common commands and modes include:

```bash
frankenbeast --help
frankenbeast interview
frankenbeast plan --design-doc <file>
frankenbeast run --plan-dir <dir>
frankenbeast issues
frankenbeast dr dead-letter-list .fbeast/dead-letter-actions.json
frankenbeast dr dead-letter-replay-dry-run .fbeast/dead-letter-actions.json <entry-id>
frankenbeast chat-server
frankenbeast beasts-daemon
```

For local development from the monorepo, build and link the CLI from the root:

```bash
npm run local:link
frankenbeast --help
```

## Development scripts

Run commands from the repository root with the workspace selector:

```bash
npm run build --workspace=@franken/orchestrator
npm run typecheck --workspace=@franken/orchestrator
npm test --workspace=@franken/orchestrator
npm run lint --workspace=@franken/orchestrator
```

Additional package scripts:

```bash
npm run chat-server --workspace=@franken/orchestrator
npm run beasts-daemon --workspace=@franken/orchestrator
npm run test:integration --workspace=@franken/orchestrator
npm run test:e2e --workspace=@franken/orchestrator
npm run test:coverage --workspace=@franken/orchestrator
```

Integration and E2E scripts enable broader runtime paths with `INTEGRATION=true` or `E2E=true`; use them when the needed local services, credentials, and fixtures are available.

## Disaster recovery dead-letter queue

Failed automation actions that exhaust bounded retries can be recorded with `recordRetryExhaustionToDeadLetterQueue()` in a JSON dead-letter queue. Each entry preserves the action class, target, attempts, retry limit, last error, first/last attempt timestamps, and a replay-safety classification of `safe`, `side-effect-approval-required`, or `unsafe`.

Operators can inspect the queue without executing side effects:

```bash
frankenbeast dr dead-letter-list <queue-file>
frankenbeast dr dead-letter-inspect <queue-file> <entry-id>
frankenbeast dr dead-letter-replay-dry-run <queue-file> <entry-id>
frankenbeast dr dead-letter-retire <queue-file> <entry-id> "handled manually"
```

The replay command is dry-run only. Entries classified as side-effecting report that explicit operator approval is required before any future replay executor may run them, while retired or unsafe entries are not replayable.

When dead-letter entries appear alongside corrupted Git worktrees, stuck approval-cop queues, broken Kanban cards, crashed dispatchers, or inconsistent liveness state, follow `docs/dr/corrupted-worktrees-and-queues.md` from the repository root. That runbook separates read-only diagnosis from repair, requires backups before mutation, and marks every destructive queue/worktree/card command as approval-cop/HITL required.

## Flaky liveness fixture replay

Issue-worker liveness/backpressure regressions can be reproduced with colocated JSON replay fixtures in `packages/franken-orchestrator/tests/unit/issues/fixtures/`. The `flaky-liveness-replay.json` fixture captures each liveness tick as thresholds, signals, checkpoint state, and the expected PM-visible worker route. Add new flaky liveness cases there when a capacity spike, dependency breaker, or recovery edge needs deterministic coverage, then run:

```bash
npm test --workspace=@franken/orchestrator -- tests/unit/issues/issue-runner.test.ts
```

Keep fixture snapshots narrow and deterministic: prefer structured `signals`, exact `expectedReasons`, and explicit `expectedRoute` values over wall-clock sleeps or prose-only assertions.

## Security limits

Context snapshot imports are size-limited before JSON parsing to reduce resource-exhaustion risk from untrusted or corrupted resume/import files. `loadContext(filePath)` defaults to a 1 MiB cap, opens snapshots in nonblocking mode, rejects non-regular paths from the opened file descriptor, and enforces the same byte cap while reading so oversized content is rejected even if the file changes after metadata inspection. Trusted tooling that intentionally owns a larger snapshot must opt in per import with `loadContext(filePath, { maxBytes })`; invalid overrides such as `0`, negative, non-finite, or unsafe integer values fail closed.

## PM handoff quality rubric

Provider handoffs include a deterministic PM handoff quality rubric generated from the current brain snapshot. The rubric gives receiving PMs and liveness tooling a structured signal for whether a handoff is ready to promote, retire, or hand to a fresh worker.

The rubric checks six criteria:

- Scope and objective: issue/task, business goal, and out-of-scope boundaries.
- Current state and decisions: completed work, current phase, and key decisions.
- Verification evidence: test, lint, build, fixture, or deterministic verifier commands and outcomes.
- Blockers and next action: blockers, owner, and explicit next step.
- Artifacts and links: branch, PR, worktree, diff, docs, URLs, or telemetry records.
- Learning and reuse: reusable lessons, retrospectives, Codex/CI feedback, and promotion/retirement rationale.

Each criterion reports `pass` only when matching evidence is present in working memory, recent events, or checkpoint context; sparse handoffs report `needs-attention` with guidance instead of inventing missing evidence. Structured tooling can import `assessPmHandoffQuality` from `@franken/orchestrator` when it needs the rubric score without parsing handoff prose.

## Package areas

| Area | Paths | Responsibility |
| --- | --- | --- |
| Core Beast Loop | `src/beast-loop.ts`, `src/phases/`, `src/context/` | Ingestion, hydration, planning, execution, and closure pipeline. |
| CLI/session workflow | `src/cli/`, `src/planning/`, `src/session/` | Interview, plan generation, chunk execution, resume, and local project flows. |
| Issue workflows | `src/issues/` | GitHub issue triage, planning, PR creation, and resolve-issues orchestration. |
| Provider adapters | `src/providers/`, `src/skills/providers/`, `src/adapters/` | Claude, Codex, Gemini, Aider, and API/CLI provider integration. |
| HTTP/chat/network | `src/http/`, `src/chat/`, `src/network/` | Chat server, managed network services, logs, secrets, and local attachment flows. |
| Beast management | `src/beasts/` | Beast catalog, run persistence, and daemon-backed run services. |
| Disaster recovery | `src/dr/` | Encrypted state backup/restore previews and failed-action dead-letter queue reports. |
| Skills | `src/skills/` | CLI skill discovery, translation, execution, and auth/config stores. |

## Related docs

- [Ramp-up notes](https://github.com/djm204/frankenbeast/blob/main/packages/franken-orchestrator/docs/RAMP_UP.md)
- [LLM caching architecture](https://github.com/djm204/frankenbeast/blob/main/packages/franken-orchestrator/docs/architecture/llm-caching.md)
- [ADR 0001: hybrid intelligent LLM caching](https://github.com/djm204/frankenbeast/blob/main/packages/franken-orchestrator/docs/adr/0001-hybrid-intelligent-llm-caching.md)
- [ADR 0002: work-scoped LLM cache isolation](https://github.com/djm204/frankenbeast/blob/main/packages/franken-orchestrator/docs/adr/0002-work-scoped-llm-cache-isolation.md)
- [Changelog](https://github.com/djm204/frankenbeast/blob/main/packages/franken-orchestrator/CHANGELOG.md)
