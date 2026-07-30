# Issue #3851 — AdapterLlmClient maxTokens validation progress

- [x] Revalidate live issue #3851 and overlapping issues #3849/#3846.
- [x] Verify the isolated branch is clean and exactly based on freshly fetched `origin/main`.
- [x] Read shared issue-resolution lessons and trace `AdapterLlmClient`, `LlmCompletionOptions`, and adapter request transformations.
- [x] Add a focused failing regression proving invalid runtime `maxTokens` reaches adapter work instead of failing at the trust boundary.
- [x] Add minimal runtime validation and request forwarding for valid `maxTokens` values.
- [x] Cover zero, negative, fractional, non-finite, unsafe, and valid values.
- [x] Run focused tests, package tests/typecheck/lint/build, and repository gates. (`npm run test` has one unrelated pre-existing Codex app-server unhandled rejection after all 5,009 orchestrator assertions pass; the isolated source test passes.)
- [x] Self-review the exact diff and append a concise reusable lesson.
- [ ] Commit, push, open a one-issue PR with `Closes #3851`, and verify exact head equality.
- [ ] Drive exact-head CI and the GitHub Codex review loop to clean with zero unresolved threads.
- [ ] Guarded squash-merge and verify issue closure, or block with exact terminal evidence.
