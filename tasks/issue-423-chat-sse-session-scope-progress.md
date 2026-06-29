# Issue 423 Chat SSE Session Scope Progress

- [x] Inspect current chat SSE/turn-runner event flow and tests
- [x] Add session identifiers to turn events and route runtime calls through session-scoped runner events
- [x] Scope `/v1/chat/sessions/:id/stream` to only emit matching session events
- [x] Add/adjust tests proving two sessions/streams do not leak events
- [x] Run targeted verification and type checks as appropriate
  - Targeted Vitest passed (3 files, 16 tests)
  - Typecheck attempted; blocked by pre-existing unrelated `makeTokenSpend` export errors in observer adapter files
- [ ] Commit and push branch
- [ ] Open PR with `Closes #423`
- [ ] Trigger bounded Codex review and address actionable findings or report terminal review state
