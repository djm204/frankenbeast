# Issue 2716 — Chat WebSocket reconnect backoff

- [x] Verified live issue scope/labels and absence of a duplicate PR.
- [x] Created an isolated branch/worktree from current `origin/main` and read shared lessons.
- [x] Reproduced the immediate reconnect loop with a focused failing timer test.
- [x] Added bounded exponential backoff (500 ms base, 10 s cap, up to 25% jitter).
- [x] Cancelled delayed reconnects on socket lifecycle cleanup.
- [x] Stopped after two explicit authentication failures or eight browser-ambiguous setup failures while preserving capped retries through transient outages.
- [x] Added focused coverage for delayed retries, exponential/capped jitter, transient and sustained pre-open failures, repeated explicit authentication failures, successful-ready reset, manual reconnect races, and unmount cancellation.
- [x] Passed `@franken/web` tests (722), typecheck, lint (0 errors; existing warnings), and production build.
- [ ] Open PR, pass CI and current-head GitHub Codex review, then merge.
