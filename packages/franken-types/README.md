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
import { resolveArchiveEntryPath, resolveContainedPath } from '@franken/types/path-containment';
import { createSeededRandom, deterministicUuid } from '@franken/types/utils';
```

## Path and archive extraction safety

Use `resolveArchiveEntryPath(extractionRoot, entryName)` before writing files from an untrusted ZIP, tar, or other archive. It denies zip-slip entries by default: parent-directory segments, POSIX/Windows absolute paths, drive/UNC paths, empty names, and NUL bytes all throw explicit errors before a destination is returned. It also resolves the nearest existing ancestor so a lexically safe member cannot write through an existing symlinked directory outside the extraction root.

Only set `allowUnsafeArchiveEntryPaths: true` for archives from a trusted operator-controlled source that requires legacy non-portable member names. The override still enforces final containment inside the extraction root; extraction code should also refuse archive symlink entries unless the caller has a separate explicit symlink policy.

## Export groups

| Area | Files | Purpose |
| --- | --- | --- |
| Branded IDs | `src/ids.ts` | `ProjectId`, `SessionId`, `TaskId`, `RequestId`, `SpanId`, and `TraceId` factories. |
| Result and verdicts | `src/result.ts`, `src/verdict.ts` | Shared success/error and verdict shapes. |
| Core context | `src/context.ts`, `src/orchestration.ts`, `src/token.ts` | Shared `FrankenContext`, task outcomes, phases, and token-spend contracts. |
| Provider contracts | `src/provider.ts`, `src/llm.ts` | LLM provider interfaces, stream events, tool schemas, MCP server config, and critique finding shapes. |
| Skills and comms | `src/skill.ts`, `src/comms.ts` | Skill metadata schemas and communication payload contracts. |
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
| `src/utils/` | Utility subpath exports. |
| `docs/RAMP_UP.md` | Deeper architecture and contributor ramp-up notes. |
| `CHANGELOG.md` | Package release history. |

## Related docs

- [Ramp-up notes](https://github.com/djm204/frankenbeast/blob/main/packages/franken-types/docs/RAMP_UP.md)
- [Changelog](https://github.com/djm204/frankenbeast/blob/main/packages/franken-types/CHANGELOG.md)
