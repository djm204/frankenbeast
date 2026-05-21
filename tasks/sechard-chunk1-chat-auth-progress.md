# PR #296 Round-2: chat-auth done correctly

Direction: re-couple chat to operator token + fail-closed startup + client plumbing.

- [x] chat-app.ts: restore `operatorToken ?? beastControl?.operatorToken` gate
- [x] chat-server.ts: fail-closed — refuse to expose chat (managed/non-loopback) without a token
- [x] cli/run.ts: resolve operator token before chat-attach
- [x] franken-web/src/lib/api.ts: ChatApiClient sends Authorization: Bearer when token configured (via ChatShell from VITE_BEAST_OPERATOR_TOKEN)
- [x] network/chat-attach.ts: accepts + presents operator token on remote session create
- [x] tests: re-added auth headers; added 3 startup-guard tests; 2 api header tests
- [x] ADR-034: final design + browser-static-token residual recorded
- [ ] reply+resolve the 2 Round-2 threads with commit hashes
- [ ] commit + push
