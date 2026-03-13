# Intelligent LLM Caching Design

**Date:** 2026-03-13

## Goal

Reduce unnecessary LLM token spend across Frankenbeast by combining provider-native session reuse with a Frankenbeast-managed cache that persists safely across sessions without leaking unrelated work context.

## Problem

Today the package has only narrow reuse mechanisms:

- chat can continue some provider-native sessions
- chunk execution compacts transcript state
- planning writes the last raw response to `llm-response.json`

It does not have a general-purpose system for:

- reusing stable skill injection and guardrails
- preserving provider-native work state across process restarts
- isolating work-specific context (`issue-99` vs `issue-110`)
- avoiding repeated full prompt reconstruction across planning, issues, chat, PR generation, and other repeat calls

## Requirements

### Functional

- Apply everywhere practical: planning, execution helpers, issues, chat, PR generation, and related internal LLM calls.
- Prefer provider-native reuse when the provider supports it.
- Fall back to a Frankenbeast-managed cache when native reuse is unavailable or fails.
- Persist safely across sessions.
- Isolate work-specific state.
- Allow project-stable context reuse across runs in the same repo.

### Isolation Rules

- `issue:99` may resume and reuse its own work cache until complete.
- `issue:110` must not see `issue:99` transcript, summaries, or provider session state.
- Cross-work reuse is limited to material explicitly classified as project-stable.
- Dynamic work context is never promoted into project-stable cache automatically.

## Proposed Model

### Cache scopes

Define three scopes:

- `project`
  - Stable, reusable material for a single repository.
  - Examples: skill injection, package ramp-up, static guardrails, reusable project context.
- `work`
  - A bounded unit of work.
  - Examples: `issue:99`, `plan:foo`, `chat:<session-id>`, `beast:<run-id>`, `pr:<branch>`.
- `step`
  - Short-lived sub-work for one call or iteration.

### Layered prompt model

Each LLM request is split into:

- stable prefix
  - reusable across the project
- work prefix
  - reusable within one work scope only
- volatile suffix
  - latest request/tool output/diff/feedback only

### Reuse order

1. provider-native reuse
2. Frankenbeast-managed work cache
3. full rebuild from source inputs

## Provider behavior

Provider capabilities must become explicit rather than a single `supportsNativeSessionResume()` flag.

Required capability dimensions:

- native work-session support
- persistent session support across processes
- prompt-prefix reuse suitability
- session metadata format/version

Expected behavior:

- Claude: native work session reuse should be first-class
- Codex: likely fallback-heavy unless current CLI semantics prove otherwise
- Gemini/Aider: fallback-heavy unless native persistence is available

## Storage layout

```text
.frankenbeast/
  .cache/
    llm/
      project/
        manifests/<project-id>.json
        stable/<fingerprint>.json
      work/
        issue-99/
          manifest.json
          provider-session.json
          summaries/
          entries/
        issue-110/
        plan-my-feature/
        chat-<session-id>/
        beast-<run-id>/
        pr-<branch>/
```

## Core components

Add a cache subsystem under `src/cache/`:

- `llm-cache-types.ts`
- `llm-cache-store.ts`
- `llm-cache-policy.ts`
- `prompt-fingerprint.ts`
- `provider-session-store.ts`
- `cached-llm-client.ts`
- `cache-metrics.ts`

## Integration points

- `src/adapters/adapter-llm-client.ts`
- `src/adapters/cli-llm-adapter.ts`
- `src/cli/session.ts`
- `src/cli/dep-factory.ts`
- `src/issues/issue-triage.ts`
- `src/issues/issue-graph-builder.ts`
- `src/chat/*` runtime entrypoints
- `src/closure/pr-creator.ts`
- `src/skills/martin-loop.ts`
- `src/skills/providers/*`

## Invalidation rules

Invalidate native session and/or managed cache when:

- provider changes
- model changes
- cache schema version changes
- prompt template fingerprint changes
- project root changes
- work scope changes

Managed cache entries may survive some provider changes if they represent only normalized stable/work summaries, but native provider session handles must not.

## Failure handling

- corrupted cache entry: ignore and rebuild
- missing native session: fall back to managed cache
- native resume failure: rebuild from managed cache and overwrite invalid native metadata
- overgrown cache: garbage-collect old completed/aborted work scopes

## Observability

Track:

- cache hits/misses
- native session resumes
- fallback rebuilds
- estimated avoided prompt tokens
- estimated avoided calls

## Test strategy

Add unit/integration coverage for:

- project-stable reuse across sessions
- no cross-issue contamination
- native session metadata persistence
- native failure -> fallback recovery
- planning repeated-pass reuse
- chat resume reuse
- invalidation on provider/model/template change
- on-disk persistence and recovery

