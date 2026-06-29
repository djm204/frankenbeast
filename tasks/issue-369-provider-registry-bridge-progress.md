# Issue #369 Provider Registry Bridge Progress

- [x] Created isolated worktree from `origin/main` on `fix/369-provider-registry-bridge`.
- [x] Inspected CLI provider registry, consolidated provider registry, and bridge code.
- [x] Added a shared typed provider catalog/config builder for bridged provider metadata.
- [x] Wired `dep-bridge` to use typed provider config instead of substring guessing.
- [x] Wired consolidated `buildProviderList` to instantiate providers through the shared catalog.
- [x] Wired default CLI provider registry to enumerate shared CLI-capable catalog entries.
- [x] Added schema fields for bridged provider model/extra args.
- [x] Added focused tests for CLI bridge mapping/rejection, consolidated provider construction, and registry/catalog alignment.
- [x] Ran focused provider bridge tests successfully.
- [x] Ran package tests/typecheck and recorded existing makeTokenSpend failures unrelated to this change.
- [ ] Push branch, open PR, and trigger Codex review.
