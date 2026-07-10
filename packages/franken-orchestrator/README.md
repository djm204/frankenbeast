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

## Package areas

| Area | Paths | Responsibility |
| --- | --- | --- |
| Core Beast Loop | `src/beast-loop.ts`, `src/phases/`, `src/context/` | Ingestion, hydration, planning, execution, and closure pipeline. |
| CLI/session workflow | `src/cli/`, `src/planning/`, `src/session/` | Interview, plan generation, chunk execution, resume, and local project flows. |
| Issue workflows | `src/issues/` | GitHub issue triage, planning, PR creation, and resolve-issues orchestration. |
| Provider adapters | `src/providers/`, `src/skills/providers/`, `src/adapters/` | Claude, Codex, Gemini, Aider, and API/CLI provider integration. |
| HTTP/chat/network | `src/http/`, `src/chat/`, `src/network/` | Chat server, managed network services, logs, secrets, and local attachment flows. |
| Beast management | `src/beasts/` | Beast catalog, run persistence, and daemon-backed run services. |
| Skills | `src/skills/` | CLI skill discovery, translation, execution, and auth/config stores. |

## Related docs

- [Ramp-up notes](./docs/RAMP_UP.md)
- [LLM caching architecture](./docs/architecture/llm-caching.md)
- [ADR 0001: hybrid intelligent LLM caching](./docs/adr/0001-hybrid-intelligent-llm-caching.md)
- [ADR 0002: work-scoped LLM cache isolation](./docs/adr/0002-work-scoped-llm-cache-isolation.md)
- [Changelog](./CHANGELOG.md)
