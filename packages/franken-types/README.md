# @franken/types

Shared TypeScript contracts, runtime schemas, branded IDs, deterministic utilities, and common DTOs for Frankenbeast packages.

Use this package when two packages need to agree on core domain shapes without depending on each other's runtime implementations.

## Requirements

- Node.js `>=22.13.0 <23 || >=24.0.0 <26`
- Install dependencies from the repository root with `npm install`

Runtime dependency: `zod` for exported validation schemas.

## Public entrypoints

```ts
import {
  createProjectId,
  createSessionId,
  createTaskId,
  makeTokenSpend,
  McpConfigSchema,
  SkillInfoSchema,
  ToolDefinitionSchema,
  type Result,
  type FrankenContext,
  type ILlmClient,
  type ProviderCritiqueFinding,
} from '@franken/types';
```

Subpath exports are available for focused imports:

```ts
import { resolveContainedPath } from '@franken/types/path-containment';
import { parseJsonPointer, setJsonPointerValue } from '@franken/types/json-pointer';
import { createSeededRandom, deterministicUuid } from '@franken/types/utils';
```

## Safe JSON Pointer handling

Use `parseJsonPointer`, `getJsonPointerValue`, `setJsonPointerValue`, or `assertSafeJsonPointer` before accepting JSON Pointer input from API, control-plane, approval, token, or state-mutation paths. The helpers default to deny-by-default behavior for prototype-pollution segments (`__proto__`, `constructor`, and `prototype`), validate RFC 6901 escaping, cap segment counts/lengths, and write missing branches as own data properties instead of following inherited properties.

Only pass `{ allowUnsafePrototypeSegments: true }` for trusted migration or compatibility code that must treat those names as data keys. Keep the default for untrusted operator, dashboard, LLM, or network input.

## Export groups

| Area | Files | Purpose |
| --- | --- | --- |
| Branded IDs | `src/ids.ts` | `ProjectId`, `SessionId`, `TaskId`, `RequestId`, `SpanId`, and `TraceId` factories. |
| Result and verdicts | `src/result.ts`, `src/verdict.ts` | Shared success/error and verdict shapes. |
| Core context | `src/context.ts`, `src/orchestration.ts`, `src/token.ts` | Shared `FrankenContext`, task outcomes, phases, and token-spend contracts. |
| Provider contracts | `src/provider.ts`, `src/llm.ts` | LLM provider interfaces, stream events, tool schemas, MCP server config, and critique finding shapes. |
| Skills and comms | `src/skill.ts`, `src/comms.ts` | Skill metadata schemas and communication payload contracts. |
| JSON Pointer hardening | `src/json-pointer.ts` | RFC 6901 parsing plus deny-by-default prototype-pollution guards for state/config patching. |
| Deterministic helpers | `src/deterministic.ts`, `src/utils/` | Seeded random, deterministic UUIDs, and clock helpers used by tests and reproducible runs. |
| API DTOs | `src/api-contracts.ts` | Shared web/API contract data transfer objects. |

## Development scripts

Run commands from the repository root with the workspace selector:

```bash
npm run build --workspace=@franken/types
npm run typecheck --workspace=@franken/types
npm test --workspace=@franken/types
npm run test:watch --workspace=@franken/types
```

The package test script writes temporary files under `../../.tmp/franken-types` so path-containment and filesystem tests do not collide with other workspaces.

## Package layout

| Path | Purpose |
| --- | --- |
| `src/index.ts` | Main package export barrel. |
| `src/path-containment.ts` | Root containment helpers exported as a subpath. |
| `src/json-pointer.ts` | Safe JSON Pointer helpers exported from the main entrypoint and `@franken/types/json-pointer`. |
| `src/utils/` | Utility subpath exports. |
| `docs/RAMP_UP.md` | Deeper architecture and contributor ramp-up notes. |
| `CHANGELOG.md` | Package release history. |

## Related docs

- [Ramp-up notes](https://github.com/djm204/frankenbeast/blob/main/packages/franken-types/docs/RAMP_UP.md)
- [Changelog](https://github.com/djm204/frankenbeast/blob/main/packages/franken-types/CHANGELOG.md)
