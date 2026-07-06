# Explicit `any` Type Migration Plan

Issue: [#338 Too Many Uses of Any](https://github.com/djm204/frankenbeast/issues/338)

## Current inventory

`npm run lint:any` runs `scripts/audit-explicit-any.mjs`, which parses TypeScript/TSX sources with the TypeScript compiler API and counts real `TSAnyKeyword` nodes. It excludes generated dependency/build directories such as `node_modules`, `dist`, `coverage`, `.turbo`, and `.git`.

The current baseline is 179 explicit `any` type nodes across 37 TypeScript/TSX files. Production code accounts for 13 occurrences; tests account for 166 occurrences.

| Area | Files | Occurrences | Production occurrences | Test occurrences |
| --- | ---: | ---: | ---: | ---: |
| `packages/franken-orchestrator` | 28 | 125 | 10 | 115 |
| `packages/franken-web` | 4 | 26 | 3 | 23 |
| `packages/franken-mcp-suite` | 4 | 25 | 0 | 25 |
| root integration tests | 1 | 3 | 0 | 3 |

## Highest-concentration files

These files should be treated as the first migration candidates because they contain the largest clusters and will unlock repeated patterns:

| Occurrences | Scope | File |
| ---: | --- | --- |
| 30 | test | `packages/franken-orchestrator/tests/unit/cli/chat-repl.test.ts` |
| 14 | test | `packages/franken-mcp-suite/src/cli/uninstall.test.ts` |
| 13 | test | `packages/franken-orchestrator/tests/unit/execution-checkpoint.test.ts` |
| 12 | test | `packages/franken-web/tests/lib/beast-api.test.ts` |
| 10 | test | `packages/franken-web/src/lib/dashboard-api.test.ts` |
| 8 | test | `packages/franken-mcp-suite/src/cli/init.test.ts` |
| 8 | test | `packages/franken-orchestrator/tests/unit/adapters/provider-registry-adapter.test.ts` |
| 7 | production | `packages/franken-orchestrator/src/adapters/adapter-llm-client.ts` |
| 7 | test | `packages/franken-orchestrator/tests/unit/adapters/observer-adapter.test.ts` |
| 6 | test | `packages/franken-orchestrator/tests/unit/cli/dep-bridge.test.ts` |
| 6 | test | `packages/franken-orchestrator/tests/unit/providers/anthropic-api-adapter.test.ts` |
| 5 | test | `packages/franken-orchestrator/tests/unit/cli/run.test.ts` |
| 5 | test | `packages/franken-orchestrator/tests/unit/llm-graph-builder.test.ts` |
| 5 | test | `packages/franken-orchestrator/tests/unit/providers/gemini-api-adapter.test.ts` |
| 4 | test | `packages/franken-orchestrator/tests/integration/issues/issues-e2e.test.ts` |

## Production hotspots

The production-side cleanup should start with these files:

1. `packages/franken-orchestrator/src/adapters/adapter-llm-client.ts` — seven explicit `any` nodes at an LLM provider boundary. Replace with provider request/result interfaces plus `unknown` runtime narrowing for raw SDK responses.
2. `packages/franken-web/src/lib/dashboard-api.ts` — three explicit `any` nodes in dashboard API plumbing. Replace with typed response unions and schema-backed decoding where payloads cross the HTTP boundary.
3. `packages/franken-orchestrator/src/network/secret-backends/cli-runner.ts` — two explicit `any` nodes around CLI process results. Replace with typed command result/error shapes.
4. Remaining single production occurrences in `franken-orchestrator` should be cleaned by subsystem after the shared adapter and API shapes above are in place.

## Migration policy

- Replace `any` with `unknown` when the value is intentionally untrusted and requires runtime narrowing.
- Replace `any` with a named interface/type when a stable domain object already exists or should exist.
- Use `Record<string, unknown>` for generic JSON-like maps instead of `Record<string, any>`.
- Add narrow helper types for mock/test seams rather than casting whole mocks to `any`.
- Keep truly dynamic provider payloads behind small, documented conversion functions that return typed domain DTOs.
- Add `// eslint-disable-next-line @typescript-eslint/no-explicit-any` only for exceptional compatibility seams, with a comment explaining the upstream type limitation.

## Phased plan

### Phase 1 — Guardrails and measurable baseline

- The repository now has `npm run lint:any`; keep it as the measurable baseline for future slices.
- Commit the baseline count and fail only on newly introduced production `any` usages while the legacy cleanup proceeds.

### Phase 2 — Shared contracts first

- Keep shared `packages/franken-types` contracts free of explicit `any` so downstream migrations do not inherit unsafe shapes.
- Promote repeated cross-package payloads into `@franken/types` when multiple packages currently model them with local loose casts.
- Prefer runtime Zod schemas at external boundaries, then infer TypeScript types from those schemas.

### Phase 3 — Production runtime packages

- Migrate `franken-orchestrator` production code in small PRs by subsystem: provider adapters first, then CLI process result boundaries and remaining one-off production occurrences.
- Migrate `franken-web` dashboard API production code after typed response unions are available, then use those helpers in clustered tests.
- Keep `franken-mcp-suite` focused on test-helper cleanup unless future audit output identifies production `any` nodes.

### Phase 4 — Test and mock cleanup

- Replace repeated test casts with typed fixture builders, e.g. strongly typed chat responses, provider results, approval events, and dashboard API envelopes.
- Keep test-only looseness local: cast at the smallest field or helper boundary instead of casting entire modules/objects.
- Prioritize high-count test files after their production types are available so tests can import the same domain contracts.

### Phase 5 — Enforce no regression

- Turn the explicit-any lint rule to error for production files once production counts are near zero.
- Keep a narrowly documented allowlist for external library seams that cannot be typed locally.
- Add CI reporting for the explicit-any audit so future PRs can see the remaining debt trend.

## Suggested first follow-up slices

1. `franken-orchestrator` adapter payloads: replace loose provider request/response `any` usage with provider-specific request/result interfaces and `unknown` boundary validation.
2. `franken-web` dashboard API and tests: introduce typed response unions plus typed mock response helpers to remove clustered test casts.
3. `franken-mcp-suite` tests: add typed hook/server fixture builders for clustered integration and CLI cleanup tests.
4. Root e2e tests: replace broad `any` casts with shared Beast loop fixture types once the orchestrator contracts are available.

## Verification strategy

For each cleanup slice:

- Run the package typecheck.
- Run targeted unit tests for changed files.
- Run package build when public types or exports change.
- Re-run the explicit-any audit to confirm the count decreases or at least does not increase.
