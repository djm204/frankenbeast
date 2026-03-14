# ADR 0001: Hybrid Intelligent LLM Caching

## Status

Accepted

## Context

`franken-orchestrator` repeatedly sends structurally similar prompts through CLI-backed providers during planning, issue triage, issue decomposition, PR generation, commit-message generation, and chunk-session compaction. That repeated work increases token spend and makes cross-session recovery expensive.

Provider support is uneven:

- some providers can safely continue a prior work session
- some only support plain prompt/response calls
- some integrations can persist continuation state across processes, others cannot

A native-only approach would leave gaps across providers and surfaces. A Frankenbeast-only cache would miss provider-native savings where they do exist.

## Decision

Use a hybrid cache model:

1. Prefer provider-native work-session reuse when the provider advertises persistent work-session support.
2. Fall back to a Frankenbeast-managed disk cache for exact response reuse and prefix/session metadata persistence.
3. Persist cache artifacts under `.frankenbeast/.cache/llm`.

The implementation is centered on:

- `src/cache/cached-cli-llm-client.ts`
- `src/cache/cached-llm-client.ts`
- `src/cache/llm-cache-store.ts`
- `src/cache/provider-session-store.ts`
- `src/cache/llm-cache-policy.ts`

## Consequences

Positive:

- repeated prompts can be served from disk without another LLM call
- compatible providers can reuse prior work-session state across process restarts
- callers do not need to implement cache persistence themselves; they only pass work-scope hints when needed

Tradeoffs:

- cache behavior is now part of the execution architecture and must be documented and tested
- callers that do not carry a safe work identity cannot yet opt into persistent native-session reuse
- some legacy paths still expose `llmResponseFile`, but it is no longer the primary LLM cache

## Current Wiring

The hybrid cache is currently wired into:

- planning in `src/cli/session.ts`
- issue triage in `src/issues/issue-triage.ts`
- issue graph decomposition in `src/issues/issue-graph-builder.ts`
- PR title/body generation in `src/closure/pr-creator.ts`
- conventional commit generation in `src/closure/pr-creator.ts`
- chunk-session compaction in `src/cli/dep-factory.ts`

## Deferred

Chat/runtime surfaces are intentionally not using persistent work-session caching yet. The current `ILlmClient.complete(prompt)` surface does not carry a chat session identity, so doing persistent cross-process native-session reuse there would blur work boundaries. That requires separate session-id plumbing through the chat runtime first.
