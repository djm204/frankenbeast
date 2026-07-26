# Brain Vitals epic #3726 closeout ledger

Verified against live GitHub and exact `origin/main` `cb2e7c39199a007c4a4c244c16aa383fb0f633d0` on 2026-07-26.

## Closeout checklist

- [x] Read and reconcile the six implementation handoffs for #3729, #3730, #3731, #3732, #3733, and #3738.
- [x] Independently verify every scoped issue is `CLOSED/COMPLETED` and every implementation PR is `MERGED`.
- [x] Verify every reviewed head, squash merge SHA, exact-head CI result, Codex result, and review-thread count.
- [x] Verify every implementation merge and the placeholder-remediation merge are ancestors of current `origin/main`.
- [x] Verify current-main integration tests, typecheck, build, lint, real-data behavior, and scope boundaries.
- [x] Verify durable local/public staging with synthetic data quarantined and placeholder writers disabled.
- [x] Record residual risks and teardown ownership without stopping the user-acceptance endpoint.
- [x] Merge exact-head closeout ledger PR #3822, close epic #3726, and verify the ledger PR and epic are terminal on live GitHub.

## Final closeout evidence

- [PR #3822](https://github.com/djm204/frankenbeast/pull/3822) merged reviewed head `f4755f40731156334e503cc9228122e0e1d0e1b0` as `93bc3a6f246af354b2e9a6be9055b3030c392d70` after [CI run 30212834273](https://github.com/djm204/frankenbeast/actions/runs/30212834273) passed 4/4 exact-head checks, [Codex returned clean on that head](https://github.com/djm204/frankenbeast/pull/3822#issuecomment-5084623584), and all 7 review threads were resolved.
- Epic [#3726](https://github.com/djm204/frankenbeast/issues/3726) is `CLOSED/COMPLETED`; its [final closure comment](https://github.com/djm204/frankenbeast/issues/3726#issuecomment-5084665577) links the merged delivery chain and independent verifier evidence.
- Live terminal verification after closure confirmed #3726, #3729, #3730, #3731, #3732, #3733, and #3738 are all `CLOSED/COMPLETED`.

## Dependency and foundation status

The six closeout lanes preserved the required order: `#3729 + #3730 → #3731 → #3732 → #3733 → #3738`.

The two earlier foundation issues are also terminal and present on current main:

- [#3727](https://github.com/djm204/frankenbeast/issues/3727) is `CLOSED/COMPLETED`; [PR #3781](https://github.com/djm204/frankenbeast/pull/3781) is merged from head `139d62fa4cd7fe8d89bc532d5be1da85538e140e` as `3d526f5573293f52e604c496dbffcefcc45fab28`, with 4/4 checks successful.
- [#3728](https://github.com/djm204/frankenbeast/issues/3728) is `CLOSED/COMPLETED`; [PR #3780](https://github.com/djm204/frankenbeast/pull/3780) is merged from head `e172a83ba9a834f16132fa01d04ad3ea5f989b3f` as `96b032ea310a31ea51de20e9df2ad6db148c5a47`, with 4/4 checks successful.

## Six-lane implementation ledger

All six PRs passed the same four exact-head checks: `build-test-lint (1337)`, `Codex CLI compatibility (0.143.0)`, `Codex CLI compatibility (latest)`, and `publish smoke (pack + offline install + run)`.

### #3729 — lifecycle churn and orphan telemetry

- Issue: [#3729](https://github.com/djm204/frankenbeast/issues/3729), `CLOSED/COMPLETED`.
- PR: [#3794](https://github.com/djm204/frankenbeast/pull/3794), `MERGED`.
- Exact reviewed head: `f6aad4929b3744d27c6fb28903a1f8094232c733`.
- Squash merge: `15d2e52b48d345c928c03014ce39c302d9d24fd2`.
- Tests: focused lifecycle/process-supervisor/create-services 53 passed; full `@franken/orchestrator` 291 files / 4,568 tests passed; package typecheck, build, and lint passed.
- CI: [run 30188834969](https://github.com/djm204/frankenbeast/actions/runs/30188834969), 4/4 successful.
- Codex: [terminal exact-head clean review](https://github.com/djm204/frankenbeast/pull/3794#issuecomment-5082149187).
- Threads: 8 total, 0 unresolved.
- Data/scope conclusion: aggregates persisted Beast attempts and successful post-exit orphan sweeps; no estimated placeholder events, `good first issue`, or Hive Brain faculty work.

### #3730 — process resource and best-effort power telemetry

- Issue: [#3730](https://github.com/djm204/frankenbeast/issues/3730), `CLOSED/COMPLETED`.
- PR: [#3795](https://github.com/djm204/frankenbeast/pull/3795), `MERGED`.
- Exact reviewed head: `afd15536fee9957ff1e4afde53ac6425c577fd65`.
- Squash merge: `f39e2ad6673d4eade82ffb4b0ae6ba7897173110`.
- Tests: focused real-child-process/resource/SQLite tests 20 passed; full `@franken/observer` 38 files / 947 tests passed; orchestrator compatibility 46 passed; package typecheck, build, and lint passed.
- CI: [run 30188609458](https://github.com/djm204/frankenbeast/actions/runs/30188609458), 4/4 successful.
- Codex: [terminal exact-head clean review](https://github.com/djm204/frankenbeast/pull/3795#issuecomment-5082125456).
- Threads: 8 total, 0 unresolved.
- Data/scope conclusion: samples actual process CPU/RSS and derives explicitly best-effort power/energy estimates; unsupported telemetry remains unavailable rather than fabricated.

### #3731 — health scoring and time-series persistence

- Issue: [#3731](https://github.com/djm204/frankenbeast/issues/3731), `CLOSED/COMPLETED`.
- PR: [#3797](https://github.com/djm204/frankenbeast/pull/3797), `MERGED`.
- Exact reviewed head: `c288b884877775cc1fbd86d4cba36110fe4d81ea`.
- Squash merge: `b320d892c479c8dff98c40e01fcab9eb50615e69`.
- Tests: focused health-score RED→GREEN suite 12 passed; full `@franken/observer` 39 files / 960 tests passed; package typecheck, build, and lint passed.
- CI: [run 30190290868](https://github.com/djm204/frankenbeast/actions/runs/30190290868), 4/4 successful.
- Codex: [terminal exact-head clean review](https://github.com/djm204/frankenbeast/pull/3797#issuecomment-5082291633).
- Threads: 2 total, 0 unresolved.
- Data/scope conclusion: computes a configurable score from persisted outcome, cache, compaction, churn, resource, and budget signals; it does not introduce a second brain identity or faculty model.

### #3732 — authenticated aggregation API, SSE, and run drill-down

- Issue: [#3732](https://github.com/djm204/frankenbeast/issues/3732), `CLOSED/COMPLETED`.
- PR: [#3798](https://github.com/djm204/frankenbeast/pull/3798), `MERGED`.
- Exact reviewed/audited head: `9f9f75445cbbbd65dfb28d00f649d9312ca7796b`.
- Squash merge: `a26a390a58f7f678dc1ad937ef55bd1015d56daf`.
- Tests: 151 focused route/executor/observer tests passed; full root suite included 4,571 orchestrator tests; package typecheck, lint, and build passed.
- CI: [run 30198649450](https://github.com/djm204/frankenbeast/actions/runs/30198649450), 4/4 successful.
- Codex: five connector rounds completed; every finding was replied to and resolved; six final post-round fixes passed the accepted bounded independent exact-head audit recorded in the [#3732 progress evidence](./brain-vitals-3732-progress.md).
- Threads: 42 total, 0 unresolved.
- Data/scope conclusion: operator-authenticated snapshot/history/drill-down routes and ticket-authenticated SSE reuse existing transport/auth patterns and read real persisted telemetry; responses are bounded, brain-scoped, and sanitized.

### #3733 — live web dashboard and per-run detail

- Issue: [#3733](https://github.com/djm204/frankenbeast/issues/3733), `CLOSED/COMPLETED`.
- PR: [#3806](https://github.com/djm204/frankenbeast/pull/3806), `MERGED`.
- Exact reviewed/audited head: `ee1800f899be04f10cb20b0320f359825e88fe14`.
- Squash merge: `2504485c1db25ec92939374bd09ffd0032592618`.
- Tests: full `@franken/web` 82 files / 758 tests passed; final focused component suite 14/14 passed; package typecheck, lint with 0 errors, and production build passed.
- CI: [run 30203568723](https://github.com/djm204/frankenbeast/actions/runs/30203568723), 4/4 successful.
- Codex: five connector rounds resolved every finding; the [independent exact-head at-cap audit](https://github.com/djm204/frankenbeast/pull/3806#issuecomment-5083624819) found and fixed history/snapshot coupling, then found no further actionable issue.
- Threads: 19 total, 0 unresolved.
- Real-data evidence: persisted-SQLite/API/activity browser golden path passed, including live history, run drill-down, and graph updates.
- Data/scope conclusion: UI truthfully represents unavailable telemetry and real REST/SSE state without generated fallback values.

### #3738 — live Brain Pulse Map

- Issue: [#3738](https://github.com/djm204/frankenbeast/issues/3738), `CLOSED/COMPLETED`.
- PR: [#3807](https://github.com/djm204/frankenbeast/pull/3807), `MERGED`.
- Exact reviewed head: `4c05c1c034931183bbd7e32e07dea3b133cf1bf4`.
- Squash merge: `e532946c57162299126022967395286bb8fb6793`.
- Tests: focused Pulse Map/dashboard 21/21 passed; full `@franken/web` 82 files / 765 tests passed; package typecheck, lint with 0 errors, and production build passed.
- CI: [run 30206918102](https://github.com/djm204/frankenbeast/actions/runs/30206918102), 4/4 successful.
- Codex: [terminal exact-head clean review](https://github.com/djm204/frankenbeast/pull/3807#issuecomment-5084008343).
- Threads: 9 total, 0 unresolved.
- Real-data evidence: live Beast daemon + persisted SQLite + real activity browser path passed with zero JavaScript errors.
- Data/scope conclusion: the five nodes are operational dimensions (`cache`, `compaction`, `churn`, `resource`, `cost`) driven by real activity and health data; no static faculty nodes or unrelated Hive implementation were added.

## Placeholder remediation and exact current main

An initial cross-lane verification found faculty/`Coming soon` placeholders that violated the epic's real-data and scope constraints. [PR #3810](https://github.com/djm204/frankenbeast/pull/3810) removed them using RED→GREEN regressions.

- Exact reviewed head: `2d488e523229195a21acfb508ecaa4b48f9e220c`.
- Merge/current-main SHA: `cb2e7c39199a007c4a4c244c16aa383fb0f633d0`.
- CI: [run 30208571241](https://github.com/djm204/frankenbeast/actions/runs/30208571241), 4/4 successful.
- Codex: [terminal exact-head clean review](https://github.com/djm204/frankenbeast/pull/3810#issuecomment-5084169295).
- Threads: 0 total, 0 unresolved.
- Regression gates: web 21/21, orchestrator 20/20, observer 12/12, build/typecheck/lint passed.

Current main renders only the five real operational dimensions, contains no static `FACULTIES` fallback or Brain Vitals `Coming soon` placeholder, and keeps Hive Brain faculty work outside this epic.

## Independent current-main verifier

Independent verifier card `t_8aa0af15` returned `PASS` on exact `origin/main` `cb2e7c39199a007c4a4c244c16aa383fb0f633d0` after reconciling all six handoffs with live GitHub, git ancestry/patch provenance, local gates, and staging.

- GitHub: 6/6 scoped issues closed/completed; 6/6 PRs merged; 24/24 exact-head checks successful; 88 review threads total / 0 unresolved; no scoped issue carries `good first issue`.
- Observer focus: 4 files, 54/54 passed.
- Orchestrator accumulated Brain Vitals focus: 10 files, 225/225 passed.
- Web full suite: 82 files, 765/765 passed.
- Workspace typecheck: 17/17 tasks passed.
- Workspace build: 10/10 tasks passed.
- Observer/orchestrator/web lint: 0 errors; existing warnings only.
- Patch provenance: every reviewed-head patch matches its squash merge, and every listed merge is an ancestor of current main.

## Durable real-data staging evidence

The canonical staging handoff (`t_0f1467ea`) and independent verifier both passed on deployed SHA `cb2e7c39199a007c4a4c244c16aa383fb0f633d0`.

- Public dashboard: https://2d23-142-161-28-139.ngrok-free.app/#/dashboard, protected independently by ngrok Traffic Policy HTTP Basic authentication. The policy and credential files are local mode-`0600` state and no credential is stored in this repository.
- Durable services: `frankenbeast-brain-vitals-stage-backend.service`, `frankenbeast-brain-vitals-stage-dashboard.service`, and `frankenbeast-brain-vitals-stage-ngrok.service` are enabled and active.
- Exposure: backend `127.0.0.1:3747` and dashboard/BFF `127.0.0.1:5190` remain loopback-only; ngrok forwards only the intended dashboard entrypoint.
- Public access control: an unauthenticated `/health` request returns HTTP 401; an authenticated `/health` request returns HTTP 200. Authenticated headless Firefox renders Brain Vitals, Pulse Map, and the genuine run drill-down through the public endpoint.
- Authenticated acceptance: snapshot, one-hour history, per-run drill-down, SSE ticket/stream, dashboard rendering, Pulse Map interaction, and run-detail interaction passed locally and through the independently authenticated public endpoint.
- Genuine run: `run_682cd478-2fc1-475c-8c3c-2b7a6e60b8a1`, with real `run.created`, `attempt.started`, and `attempt.finished` events and one real process sample.
- Synthetic-data correction: contaminated staging state and the rejected seed helper were quarantined; `frankenbeast-brain-vitals-stage-pulse.timer` is disabled/inactive and its pulse service is inactive. No synthetic epoch is used as acceptance evidence.
- Keep-live decision: services and tunnel remain running for user testing. Repository owner/operator `djm204` owns teardown, triggered by explicit user confirmation that testing is complete (or an explicit request to withdraw the endpoint); teardown means disabling/stopping the three `frankenbeast-brain-vitals-stage-*` services and removing the protected local ngrok policy/credential state.

## Scope and documentation conclusions

- Whole-epic scope is limited to shared types and MCP-suite foundations (`packages/franken-types`, `packages/franken-mcp-suite`), observer telemetry/persistence, orchestrator lifecycle/API/proxy/docs, and the web Brain Vitals API/dashboard/Pulse Map/tests.
- No `IBrain`, `BrainRegistry`, lesson consolidation, hive-mind, central-command chat, or other unrelated Hive Brain implementation was introduced.
- The current Pulse Map intentionally exposes only the five operational dimensions. Faculty nodes remain an additive cross-epic follow-up once a compatible real faculty activity stream exists.
- Existing SSE/ticket auth and UI detail-panel conventions were reused; no charting dependency or duplicate project identity was introduced.
- The final architecture and route contract are documented in `docs/ARCHITECTURE.md`, `packages/franken-observer/README.md`, and `packages/franken-web/README.md`. A standalone Brain Vitals ADR was not added; the epic's implemented architecture is durably captured in those docs and this ledger.
- The matching #3729/#3730 progress files have been reconciled with the live terminal evidence recorded above.

## Residual risks

- The ngrok free-tier URL may rotate or expire despite the durable enabled service; its independently authenticated endpoint returned 401 without credentials and 200 with credentials at closeout, and it must remain live until the owner receives the explicit teardown trigger above.
- Best-effort power is an estimate derived from real process resource samples, not metered electricity; unsupported telemetry remains unavailable rather than invented.
- A full local orchestrator sweep passed 4,573/4,576 tests. The three failures assert that managed services/remote chat are absent, but this acceptance host must keep the staging services live. Focused product suites, exact-head CI, full web, typecheck, build, lint, and public acceptance are green.
- Faculty activity nodes are intentionally deferred until real Hive Brain activity data exists; adding placeholders would regress the verified scope/real-data boundary.

No blocking correctness, security, regression, scope, placeholder, review, merge, issue-state, or staging discrepancy remains for epic #3726 closeout.
