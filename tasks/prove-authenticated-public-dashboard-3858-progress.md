# Issue #3858 — Authenticated Public Live Dashboard Acceptance Progress

- [x] Read the live issue, dependencies, upstream deployment handoff, and authoritative acceptance criteria.
- [x] Verify the isolated branch is clean at exact reviewed `origin/main` and Git identity is David Mendez <me@davidmendez.dev>.
- [x] Reproduce the pre-acceptance authenticated public browser/API/SSE/genuine-runtime path; the browser gate exposed a real 390 px horizontal-overflow defect after every earlier live criterion passed.
- [ ] RED→GREEN: the new gated public-path acceptance test reached RED against deployed reviewed main at the responsive-layout assertion; the minimal CSS fix is implemented and awaits reviewed-main deployment for final GREEN.
- [x] Authenticate through the public HTTPS endpoint without credentials in URLs, logs, screenshots, payloads, source, or durable evidence; an independent unauthenticated context receives HTTP 401.
- [x] Match public provider/workspace/task/run data to the current Hermes SQLite/CLI source state and prove `design-interview` is absent.
- [x] Generate a genuine Hermes comment transition and observe timeline plus Brain Pulse update without refresh.
- [x] Open bounded task/event detail and match entity, event ID, source task, and source timestamp against Hermes state.
- [x] Execute a genuinely governed `policy.apply` probe against a verified nonexistent task and independently verify its audited rejection plus unchanged source state.
- [x] Interrupt/recover the real EventSource stream and verify cursor replay with one event represented once in Brain Pulse and once in the timeline.
- [ ] Verify browser console/page/network/auth errors, redaction, keyboard accessibility, responsive layouts, and reduced-motion behavior.
- [ ] Capture deployed SHA, service health, endpoint health, artifact parity, and sanitized evidence.
- [x] Focused web tests (84/84), full repository tests, full lint, full typecheck, full build, dependency audit, and `git diff --check` pass.
- [x] Final independent review is clean after remediating address classification, SSE route continuation, browser installation, timestamp normalization, and stale runbook prose with RED→GREEN coverage.
- [x] Commit with required identity, push, and open issue-linked PR #3874.
- [ ] Complete bounded exact-head GitHub Codex review/remediation, green CI, and fully paginated zero unresolved threads.
- [ ] Guarded exact-head routine squash merge, replay public acceptance against reviewed main, and record durable sanitized issue/task evidence.
