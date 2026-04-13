# ADR 0002: Work-Scoped LLM Cache Isolation

## Status

Accepted

## Context

The goal is to lower token spend across repeated work without allowing one unit of work to leak dynamic context into another.

Examples:

- `issue:99` should resume safely across sessions until the issue is done
- `issue:110` must not inherit `issue:99`'s transcript, summaries, or provider session state
- project-stable prompt material should be reusable without sharing work-local state

## Decision

Partition the cache into:

- project scope: reusable stable prefixes and exact responses that are safe for the whole repo
- work scope: provider session metadata, work-local prefixes, and exact responses for one bounded unit of work

Current work ids include:

- `plan:<name>`
- `issue:<number>`
- `issues:<sorted-issue-list>` for batch triage
- `pr:<branch>`
- `commit:<scope>`
- `chunk-compactor:<plan>`

Disk layout is:

```text
.fbeast/
  .cache/
    llm/
      project/<project>/stable/<key>.json
      work/<project>/<work>/entries/<key>.json
      work/<project>/<work>/provider-session.json
```

## Consequences

Positive:

- unrelated work items do not share dynamic prompt history
- provider session metadata is recoverable after process restart
- invalidation can happen at the work boundary instead of forcing global cache drops

Tradeoffs:

- every caller that wants safe persistence needs a stable work id
- surfaces without a trustworthy work id cannot yet use persistent native-session reuse

## Invalidators

Provider-session reuse is rejected when any of these change:

- schema version
- provider
- model
- prompt fingerprint for the stable/work prefix

Managed response entries remain exact-prompt keyed, so prompt drift naturally misses the cache without contaminating neighboring work scopes.
