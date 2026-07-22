# PR #3515 closeout progress

- [x] Confirm local branch/head and clean worktree.
- [x] Refresh live PR metadata, exact-head checks, CI failure logs, reviews, comments, inline comments, and paginated review threads.
- [x] Identify approval-cop invocation and preserve an auditable UTC action log.
- [x] Reproduce the lockfile and published-install security failures locally.
- [x] Implement a consumer-safe remediation: migrate `@franken/mcp-suite` from SDK v1 to split `@modelcontextprotocol/server@2.0.0-beta.5`.
- [x] Run focused install/audit/pack/offline-consumer verification and prove the vulnerable packages are absent.
- [x] Run repository test, integration, lint, typecheck, and build gates; isolate the one unrelated full-suite timeout as a passing targeted rerun.
- [x] Add a focused publish-smoke assertion that rejects missing or pre-2.0.10 `@hono/node-server` versions in the clean packed consumer.
- [x] Declare a publish-visible patched Hono server dependency and regenerate the workspace lockfile.
- [x] Re-run the focused unit test, package packing/external install, dependency-tree assertion, and consumer audit.
- [x] Inspect the packed manifest and commit the focused correction with timestamped audit evidence.
- [x] Commit with a conventional commit message.
- [ ] Route push and PR-body correction through approval-cop.
- [ ] Reply to and resolve both Codex findings through approval-cop.
- [ ] Trigger and obtain a fresh current-head Codex clean result within the authorized cap.
- [ ] Verify zero unresolved Codex-authored review threads.
- [ ] Verify all exact-head CI checks are green.
- [ ] Merge through approval-cop and verify live MERGED state.

## Reproduction findings (2026-07-21 UTC)

- Exact CI merge commit `14a5d8d89ccc4d6d9dd6d1ec59cbd7886d3f80c1` fails `npm ci`; npm's debug log reveals the real error: the branch's nested override for `@modelcontextprotocol/sdk@^1.29.0` conflicts with main's direct `@modelcontextprotocol/sdk` dependency.
- Root installs succeed when the override is flattened and raised to `@hono/node-server@2.0.10`; `npm audit` reports zero vulnerabilities.
- A normal published consumer of `@modelcontextprotocol/sdk@1.29.0` resolves `@hono/node-server@1.19.14`, which is vulnerable to `GHSA-frvp-7c67-39w9`; the root override is not inherited by consumers.
- A published `npm-shrinkwrap.json` does not force the incompatible `2.0.10` transitive version in a downstream install, including when its SDK lock metadata is edited; the consumer still resolves `1.19.14`.
- Pinning the SDK to `1.24.3` removes Hono but introduces high-severity SDK advisories (`GHSA-345p-7cg4-v4c7` and `GHSA-8r9q-7v3j-jr4g`).
- Bundling the SDK plus Hono produces an audit-clean consumer but ships the SDK's full dependency tree and leaves `npm ls` invalid because SDK 1.29.0 declares `@hono/node-server@^1.19.9`.
- Migrating to the split v2 SDK removes Hono from the published runtime tree, but only beta `2.0.0-beta.5` exists and the low-level server API requires non-trivial schema/result type migration. The spike was stopped after three typecheck iterations per repository execution limits.
- Upstream v1.x still declares `@hono/node-server@^1.19.9`; upstream issue `modelcontextprotocol/typescript-sdk#2036` remains open with no released stable fix.

## Remediation decision and trade-offs

| Alternative | Security coverage | Compatibility / maintenance trade-off | Decision |
| --- | --- | --- | --- |
| Wait for an SDK-v1 upstream fix | Eventually removes exposure if released | Leaves current consumers exposed with no bounded delivery date | Rejected as a dead stop |
| Maintain a patched/vendored SDK-v1 fork | Removes the transitive exposure immediately | Permanent fork/rebase/release burden and protocol drift risk | Viable fallback, not selected |
| Migrate to split MCP v2 packages | Removes Hono node-server from the published tree and follows the upstream direction | Beta API risk and a small request-handler compatibility adaptation | **Selected** after the narrow migration passed all verification |
| Bundle/patch transitives at publish time | Could force a patched tree | Invalid dependency metadata, larger package, and weak provenance/auditability | Rejected |

## Verification evidence

- Full workspace build: 10/10 packages passed.
- Full workspace typecheck: 17/17 tasks passed.
- `@franken/mcp-suite`: 39 test files and 601 tests passed.
- Publish smoke packed all 10 packages, installed them outside the monorepo, audited the clean consumer tree, and executed every CLI help check; zero vulnerabilities.
- Independent packed-tree inspection found `@modelcontextprotocol/server@2.0.0-beta.5`, no `@modelcontextprotocol/sdk`, and the publish-visible `@hono/node-server@^2.0.10` security floor.
- Publish smoke now rejects missing or pre-2.0.10 Hono node-server versions and audits the clean packed consumer at high severity so root-only overrides cannot mask this class of exposure again.
- MCP integration suite: 5 files and 34 tests passed, including all seven standalone stdio servers, the combined server, and proxy-server tool discovery through `@modelcontextprotocol/client@2.0.0-beta.5`.
- Fresh `npm ci` succeeded; `npm audit --omit=dev` reported zero vulnerabilities.
- Full `npm test` passed all MCP-suite tests and all but one unrelated orchestrator test, which timed out only under the concurrent workspace run and then passed alone (50/50 tests, 1.32 seconds).
- Final full `npm test` passed 9/10 package tasks but hit one unrelated `@franken/web` alert-query failure; the exact failing file immediately passed 20/20 alone. Full lint, typecheck, and build passed.
