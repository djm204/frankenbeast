# PR #296 Round-2: chat-auth done correctly

Direction: re-couple chat to operator token + fail-closed startup + client plumbing.

- [x] chat-app.ts: restore `operatorToken ?? beastControl?.operatorToken` gate
- [x] chat-server.ts: fail-closed — refuse to expose chat (managed/non-loopback) without a token
- [x] cli/run.ts: resolve operator token before chat-attach
- [x] franken-web no longer sends the long-lived operator token from browser code; issue #566 superseded the earlier VITE_BEAST_OPERATOR_TOKEN browser plumbing with same-origin server-side proxy auth.
- [x] network/chat-attach.ts: accepts + presents operator token on remote session create
- [x] tests: re-added auth headers; added 3 startup-guard tests; 2 api header tests
- [x] ADR-034: final design + browser-static-token residual recorded
- [x] reply+resolve the 2 Round-2 threads with commit hashes
- [x] commit + push

## Review

- PR #296 is merged on `origin/main` as `f281e8e fix(security): Chunk 1 — fail-closed HTTP & approval boundaries (#296)`. The local round-2 reply/push checklist was stale and is now complete/superseded by merged PR state.
