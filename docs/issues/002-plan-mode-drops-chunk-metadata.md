# Issue: Plan Mode Drops Chunk Metadata When Writing Files

> **Historical archive notice (2026-07-09):** This document is preserved from the pre-consolidation 2026-03 audit. It may mention removed packages such as `franken-mcp`, `frankenfirewall`, `franken-comms`, `franken-heartbeat`, or legacy root scripts such as `test:all`. Use the status annotations in `docs/issues/INDEX.md` and the live `package.json`/`packages/*` workspaces as the source of truth for current contributor work.

Severity: high
Area: `@franken/orchestrator` planning UX

## Summary

The design-doc planning flow loses the LLM's structured chunk metadata before writing chunk files.

## Intended Behavior

`frankenbeast plan --design-doc ...` should generate chunk files that preserve the chunk objective, file list, success criteria, verification command, and dependency metadata produced during decomposition.

## Current Behavior

- `LlmGraphBuilder` starts with rich `ChunkDefinition` objects.
- `Session.runPlan()` converts the resulting `PlanGraph` back into `ChunkDefinition[]`.
- That conversion uses the impl-task prompt as `objective`, sets `files` to `[]`, `successCriteria` to `''`, and `verificationCommand` to `''`.
- `writeChunkFiles()` then persists those empty fields into the generated markdown.

## Evidence

- `@franken/orchestrator/src/planning/llm-graph-builder.ts:8-15`
- `@franken/orchestrator/src/cli/session.ts:249-267`
- `@franken/orchestrator/src/cli/file-writer.ts:49-82`

## Impact

- Generated plan files are materially worse than the underlying decomposition result.
- Harden steps lose their explicit verification command.
- Human review of generated chunks is degraded because the file does not contain the actual structured plan.

## Acceptance Criteria

- Preserve original chunk metadata through plan generation and file writing.
- Stop reconstructing chunk files from lossy impl-task prompts.
- Add a regression test that asserts generated chunk files include non-empty files, success criteria, and verification command fields.
