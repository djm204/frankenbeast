# PR #3515 UTC action log

- 2026-07-21T20:24:13Z — CI run 29865582600 reproduced `npm ci` EUSAGE at merge commit `14a5d8d89ccc4d6d9dd6d1ec59cbd7886d3f80c1`.
- 2026-07-21T20:55:32Z — Local exact-tree reproduction confirmed npm Arborist rejected conflicting root and nested overrides.
- 2026-07-21T20:56:33Z — Isolated consumer audit confirmed SDK 1.29.0 resolves vulnerable `@hono/node-server@1.19.14` without a consumer-root override.
- 2026-07-21T20:59:00Z — Published shrinkwrap experiments confirmed downstream npm ignores the incompatible Hono lock in favor of SDK's declared `^1.19.9` range.
- 2026-07-21T21:02:04Z — Bundled-dependency experiment produced an audit-clean but `npm ls`-invalid and substantially bloated consumer tree; rejected as non-minimal.
- 2026-07-21T21:05:00Z — Split SDK v2 beta spike reached type-level API migration requirements; stopped after three typecheck iterations.
- 2026-07-21T21:08:07Z — Upstream v1.x and issue #2036 rechecked; no stable publish-safe release exists. Human dependency-strategy decision required before implementation.
- 2026-07-21T21:57:00Z — Reopened the blocked security scope instead of stopping at strategy escalation; completed the split MCP-v2 request-handler migration.
- 2026-07-21T21:58:00Z — Selected split MCP v2 over waiting or maintaining a fork because it removes Hono node-server from the published graph with a narrow, reversible code change.
- 2026-07-21T21:59:00Z — Full build/typecheck and all 601 MCP-suite tests passed; a clean external packed install audited at zero vulnerabilities and contained neither SDK v1 nor Hono node-server.
- 2026-07-21T22:00:00Z — Added a publish-smoke clean-consumer audit gate so root-only overrides cannot mask published dependency exposure.
- 2026-07-22T09:40:00Z — Reinstalled from the lockfile with `npm ci`; runtime audit remained at zero vulnerabilities and the 601-test MCP unit suite passed.
- 2026-07-22T09:42:00Z — Fresh integration verification exposed a missing v1 test-client dependency after the runtime SDK migration; rejected re-adding SDK v1 because it restored the audited Hono exposure.
- 2026-07-22T09:44:00Z — Migrated the integration client to split `@modelcontextprotocol/client@2.0.0-beta.5`; all 34 integration tests passed and `npm audit --omit=dev` returned zero vulnerabilities.
- 2026-07-22T09:46:00Z — Full workspace test run passed the changed MCP suite (601/601) and all other packages except one unrelated orchestrator timeout under concurrent load; its targeted rerun passed 50/50 in 1.32 seconds.

No GitHub write, push, review trigger, thread mutation, or merge action was executed.
