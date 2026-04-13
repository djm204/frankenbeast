# Intelligent LLM Caching

## Summary

`franken-orchestrator` now uses a hybrid LLM cache:

- provider-native work-session continuation first
- Frankenbeast-managed disk cache second

This reduces repeat token spend without letting unrelated work scopes share dynamic context.

## Components

- `src/cache/cached-cli-llm-client.ts`
  Wraps `CliLlmAdapter` with cache-aware `complete(prompt, hint?)`.
- `src/cache/cached-llm-client.ts`
  Applies policy, exact-response reuse, and native-session fallback rules.
- `src/cache/llm-cache-policy.ts`
  Splits prompts into stable prefix, work prefix, and volatile suffix.
- `src/cache/llm-cache-store.ts`
  Persists project/work cache entries on disk.
- `src/cache/provider-session-store.ts`
  Persists native provider session metadata per work scope.
- `src/skills/providers/cli-provider.ts`
  Exposes explicit cache capability metadata per provider.
- `src/adapters/cli-llm-adapter.ts`
  Accepts `cacheSession` hints and exposes persisted session metadata via `consumeSessionMetadata()`.

## Scope Model

- Project scope
  Stable prompt material reusable for one repo.
- Work scope
  A bounded unit like `plan:foo`, `issue:99`, `pr:feat/branch`, or `chunk-compactor:session`.
- Volatile suffix
  The newest prompt content for one call.

Managed response reuse is exact-prompt keyed. Native-session reuse is keyed by the stable/work fingerprint, not by the full volatile suffix.

## Filesystem Contract

```text
.fbeast/
  .cache/
    llm/
      project/<project>/stable/<key>.json
      work/<project>/<work>/entries/<key>.json
      work/<project>/<work>/provider-session.json
```

`provider-session.json` is rejected if the schema version, provider, model, or stable/work prompt fingerprint no longer matches.

## Wired Surfaces

The cache is currently used by:

- plan decomposition in `src/cli/session.ts`
- issue triage in `src/issues/issue-triage.ts`
- issue chunk decomposition in `src/issues/issue-graph-builder.ts`
- PR description generation in `src/closure/pr-creator.ts`
- commit message generation in `src/closure/pr-creator.ts`
- chunk-session compaction in `src/cli/dep-factory.ts`

## Not Yet Wired

Chat and chat-server are not yet using persistent work-session caching. The current chat/runtime path does not carry a safe work/session identifier through `ILlmClient.complete(prompt)`, so persistent reuse there would risk crossing conversation boundaries.

## Operational Notes

- `ProjectPaths.llmResponseFile` still exists for backward compatibility, but the real cache now lives under `.fbeast/.cache/llm`.
- Exact-response reuse works across process restarts.
- Native-session reuse only activates when the provider advertises persistent work-session support.
