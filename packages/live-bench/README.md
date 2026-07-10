# @franken/live-bench

Corpus, fixture, workspace, and evidence helpers for live Codex/Gemini/Frankenbeast MCP-suite benchmark work.

The package exposes reusable primitives plus the `fbeast-live-bench` CLI so contributors can inspect benchmark task sets before wiring or running live client comparison workflows.

## Requirements

- Node.js `>=22.13.0 <23 || >=24.0.0 <26`
- Install dependencies from the repository root with `npm install`
- Live runs require any provider CLI credentials needed by the benchmark client under test

## Public entrypoints

```ts
import {
  loadCorpus,
  loadTaskFile,
  BenchmarkTaskSchema,
  FixtureStore,
  WorkspaceProvisioner,
  type BenchmarkTask,
  type BenchmarkMatrixRow,
  type ClientRunResult,
} from '@franken/live-bench';
```

Key exports:

| Export | Purpose |
| --- | --- |
| `loadCorpus`, `loadTaskFile` | Load benchmark task definitions from a corpus root. |
| `BenchmarkTaskSchema` | Validate benchmark task JSON with Zod. |
| `ToolCallEvidenceSchema` | Validate a single tool-call evidence record. |
| `ToolCallEvidenceManifestSchema`, `serializeToolCallEvidence` | Validate and serialize the full tool-call evidence artifact array. |
| `FixtureStore` | Manage fixture files used by benchmark workspaces. |
| `WorkspaceProvisioner` | Create isolated workspaces and capture environment snapshots for benchmark runs. |

## CLI

The package publishes `fbeast-live-bench`.

```bash
npm run build --workspace=@franken/live-bench
npm exec --workspace=@franken/live-bench -- fbeast-live-bench --help
npm exec --workspace=@franken/live-bench -- fbeast-live-bench list <corpus-root>
```

`list` loads the corpus root and prints the benchmark task ids, one per line. Use it as a lightweight sanity check before a live benchmark run.

## Development scripts

Run commands from the repository root with the workspace selector:

```bash
npm run build --workspace=@franken/live-bench
npm run typecheck --workspace=@franken/live-bench
npm test --workspace=@franken/live-bench
```

Additional script:

```bash
npm run test:live --workspace=@franken/live-bench
```

`test:live` builds the package and runs `tests/live` with `FBEAST_LIVE_BENCH_E2E=1`; only use it when the required live provider credentials and local tooling are available.

## Package layout

| Path | Purpose |
| --- | --- |
| `src/cli/main.ts` | `fbeast-live-bench` command entrypoint. |
| `src/corpus/` | Corpus schemas and loaders. |
| `src/evidence/` | Tool-call evidence schemas and serializers. |
| `src/workspace/` | Fixture and workspace provisioning helpers. |
| `corpus/` | Packaged benchmark corpus assets. |
| `fixtures/` | Packaged benchmark fixtures. |

## Related docs

This package currently keeps its package-specific onboarding in this README. See the repository root docs and package scripts for broader Frankenbeast setup and release guidance.
