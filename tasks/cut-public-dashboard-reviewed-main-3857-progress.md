# Issue #3857 — Reviewed-Main Live Dashboard Cutover Progress

- [x] Read live issue #3857 and upstream handoffs; treat acceptance criteria and definition of done as authoritative.
- [x] Verify isolated branch is clean at exact reviewed `origin/main` and Git identity is David Mendez <me@davidmendez.dev>.
- [x] RED: reproduce stale/deleted `brain-vitals-stage` service provenance and dashboard HTTP 503 while backend/ngrok remain reachable.
- [x] Build backend and web from exact reviewed main SHA and run focused tests plus the production build gate.
- [x] Configure durable user services against the immutable reviewed-main checkout/artifact with explicit live Hermes home/database discovery.
- [x] Preserve operator credentials, loopback-only bindings, authenticated HTTPS tunnel, redaction, and least privilege.
- [ ] Restart services and verify backend, dashboard/BFF, tunnel, authenticated SSE, and restart survival after the proxy fix merges.
- [ ] Prove local and public endpoints serve the same final recorded SHA and current genuine Hermes state without staging/fixture fallback.
- [x] Document verified rollback/teardown without credentials.
- [x] Independently review repository changes and remediate blocking findings.
- [ ] Commit, push, and open a linked PR.
- [ ] Complete bounded exact-head GitHub Codex review/remediation, green CI, and zero unresolved threads.
- [ ] Guarded exact-head routine squash merge and record final deployment/issue evidence.

## Initial RED evidence

- Reviewed deployment floor and current branch SHA: `1d339b445fe8e285d9a139ddc67032f51c42d01f`.
- Existing backend and dashboard services use deleted worktree `/home/pfkagent/dev/frankenbeast/.worktrees/brain-vitals-stage`.
- Existing listeners: backend `127.0.0.1:3747`, dashboard `127.0.0.1:5190`, ngrok control `127.0.0.1:4040`.
- Probe before cutover: backend `/health` HTTP 200, dashboard HTTP 503, ngrok control HTTP 200.
- Old stage backend/dashboard/ngrok units remain enabled and active; their immutable artifact provenance cannot be proven.

## Cutover and live validation evidence

- Immutable detached deployment checkout initially built at reviewed main `1d339b445fe8e285d9a139ddc67032f51c42d01f`.
- Canonical `frankenbeast-smart-swarm-live-{backend,dashboard,ngrok}.service` units are enabled and active; former `frankenbeast-brain-vitals-stage-*` units are disabled.
- Backend and dashboard wrappers fail closed unless the checkout HEAD equals the configured reviewed SHA and the explicit live Hermes database is readable.
- Authenticated local/public provider and Hermes snapshot APIs return HTTP 200; unauthenticated public access returns 401.
- Local/public HTML SHA-256 matched (`22012030a8406f5c7855ccee0a3ed56fcd5facc8fa6f0a185706f19a9c180fc1`).
- Genuine live snapshot exposed the current #3857 card, two current tasks, two workspaces, and two activity records; `design-interview` was absent.
- Authenticated public Hermes SSE ticket/stream returned HTTP 200 with a live frame.
- Browser validation exposed a real public-cutover defect: reverse-proxied WebSocket same-origin checks compared the public Origin with the loopback BFF URL and returned 403.
- RED→GREEN regressions now cover explicitly configured forwarded HTTPS HTTP requests, reject untrusted/spoofed forwarded origins, reject malformed forwarded and raw WebSocket hosts without crashing, and proxy trusted forwarded WebSocket upgrades while preserving the configured public origin and server-side operator authentication.
- A separate constant-time proxy-token check closes the loopback forwarded-header forgery gap; partial proxy configuration fails closed and the marker is stripped before upstream forwarding.
- Focused static-server tests pass 32/32; orchestrator tests pass 4,969/4,969. Changed-file lint, package/full typecheck, and package/full builds pass. The full Turbo test command reached 4,969/4,969 orchestrator assertions but exited nonzero on a pre-existing unrelated `Codex app-server is unavailable` unhandled rejection; CI remains the clean-environment gate.
- Independent Codex CLI review returned no actionable correctness findings after the proxy-token and malformed-Host remediations.
- Durable rollback/teardown procedure: `docs/runbooks/smart-swarm-reviewed-main-cutover.md`.
