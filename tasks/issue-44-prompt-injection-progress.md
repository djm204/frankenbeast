# Issue #44 prompt-injection hardening progress

- [x] Created isolated worktree on `issue/44-prompt-injection-via-chunk-file-content-em` from `origin/main`.
- [x] Read live GitHub issue #44 and confirmed there are no comments.
- [x] Inspected `ChunkFileGraphBuilder` source and existing unit tests.
- [x] Added RED regression tests for fenced chunk content and delimiter breakout rejection.
- [x] Implemented minimal prompt wrapping and delimiter validation.
- [x] Documented chunk-file trust model in `docs/ARCHITECTURE.md`.
- [x] Ran targeted and relevant broader tests.
- [ ] Commit, push, open PR with `Fixes #44`.
