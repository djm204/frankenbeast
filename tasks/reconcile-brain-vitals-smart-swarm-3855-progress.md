# Issue #3855 — Canonical Live Operations Surface Progress

- [x] Read the live issue and treat its acceptance criteria and definition of done as authoritative.
- [x] Verify the isolated worktree is clean, at exact current `origin/main`, and uses David Mendez <me@davidmendez.dev>.
- [x] Inspect Smart Swarm and legacy Brain Vitals routes, navigation, data contracts, provider metadata, docs, and tests.
- [x] Document the canonical product decision: Smart Swarm replaces the acceptance-only legacy Brain Vitals operator surface.
- [x] RED→GREEN: prove legacy Brain Vitals navigation/route resolves to the canonical Smart Swarm surface.
- [x] RED→GREEN: prove stale `design-interview`/fixture data cannot populate production paths.
- [x] RED→GREEN: expose traceable metric provenance and capability/availability metadata without misleading zero values.
- [x] RED→GREEN: derive provider-specific labels from adapter metadata rather than shared UI branches.
- [x] Align route names, navigation, docs, empty states, and completion messaging with the canonical product model.
- [x] Run focused tests, full relevant suites, lint, typecheck, build, and `git diff --check`.
- [x] Complete independent pre-commit review and remediate blocking findings.
- [ ] Commit with conventional metadata, push, and open a linked PR.
- [ ] Complete bounded exact-head GitHub Codex review/remediation, green CI, and zero unresolved threads.
- [ ] Guarded exact-head routine merge and verify issue closure.
- [ ] Verify public deployment and browser acceptance against real current Hermes work with no fixture/staging fallback.

## Verification evidence

- RED route test: legacy `#/brain-vitals` initially resolved to `chat`; GREEN resolves to `#/smart-swarm`.
- RED stale-data test: the dashboard initially invoked the acceptance-only Brain Vitals API; GREEN does not mount or query it.
- RED provenance test: operational counts initially had no capability/provenance presentation; GREEN labels every count as available or unsupported and attributes it to adapter metadata plus snapshot capture time.
- `npm test --workspace @franken/web -- --run`: 85 files, 847 tests passed.
- `LIVE_SMART_SWARM_E2E=1 npx vitest run tests/e2e/smart-swarm-hermes-live.test.ts`: 3 tests passed, including authenticated HTTP/SSE and real Chromium proof against isolated current Hermes state.
- `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`: passed.
- Full `@franken/orchestrator` run: 4,887/4,887 tests passed, but Vitest reported one pre-existing unhandled `Codex app-server is unavailable` rejection from `runtime-contract.test.ts`; that file passes 12/12 alone and the initially timing-sensitive files pass 157/157 without cross-suite contention.
- Final independent review passed with no security concerns or logic errors after remediation of snapshot-plus-live event provenance.
