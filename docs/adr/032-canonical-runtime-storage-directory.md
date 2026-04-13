# ADR-032: Canonical Runtime Storage Directory

- **Date:** 2026-04-12
- **Status:** Accepted
- **Deciders:** pfk

## Context

Frankenbeast accumulated two competing project-scoped runtime directories:

- `.frankenbeast/` from the original CLI/orchestrator contract
- `.fbeast/` introduced by the MCP suite and dual-mode launch work

Keeping both names in live code creates drift and user confusion. Different packages can write related runtime artifacts to different directories, which breaks the shared-state goal and makes the documented filesystem contract unreliable.

At the same time, environment variable names such as `FRANKENBEAST_PASSPHRASE`, `FRANKENBEAST_RUN_CONFIG`, and `FRANKENBEAST_BEAST_OPERATOR_TOKEN` are already part of user workflows and CI setups. Renaming those env vars would expand the migration scope and introduce unnecessary breakage unrelated to the storage-folder problem.

## Decision

`.fbeast/` is the canonical project-scoped runtime directory for all live Frankenbeast storage.

This applies across active packages and runtime artifacts, including:

- config and secret material
- build artifacts and checkpoints
- chunk session state
- chat and network state
- audit artifacts
- shared Beast and MCP persistence

`.frankenbeast/` is no longer a valid target for live runtime writes in active codepaths. When active code or active contract docs describe project-local storage, they must reference `.fbeast/`.

`FRANKENBEAST_*` environment variable names remain unchanged for compatibility. The migration is about filesystem location, not environment-variable branding.

Historical planning documents, superseded specs, and stale notes do not need mass rewrites unless they are being actively refreshed for another reason.

## Consequences

### Positive
- Live runtime storage has one unambiguous location.
- Beast mode and MCP mode share a single documented filesystem contract.
- User setup, debugging, and cleanup become simpler because artifacts live under one directory tree.
- Existing CI and shell automation using `FRANKENBEAST_*` env vars continues to work.

### Negative
- Any user tooling still reading `.frankenbeast/` paths must be updated.
- Some historical documentation will continue to mention `.frankenbeast/`, which can be confusing if read without context.

### Risks
- Partial migrations can still leave one package writing to the old directory if verification is too narrow.
- Users may retain orphaned `.frankenbeast/` directories from previous runs until they clean them up manually.

## Alternatives Considered

| Option | Pros | Cons | Rejected Because |
|--------|------|------|-----------------|
| Keep both `.frankenbeast/` and `.fbeast/` active | Minimizes immediate churn | Permanent ambiguity, split state, harder debugging | Conflicts with shared-state and single-contract goals |
| Revert everything back to `.frankenbeast/` | Preserves original CLI naming | Fights the MCP suite direction and already-landed `.fbeast` work | Moves away from the current dual-mode contract |
| Rename storage and env vars together | Maximum naming consistency | Much larger breaking change for little practical benefit | Env-var compatibility is more valuable than perfect naming symmetry |
