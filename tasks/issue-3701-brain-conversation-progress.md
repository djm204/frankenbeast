# Issue #3701 BrainConversation progress

- [x] Rebase the clean isolated issue branch onto current `origin/main`.
- [x] Verify issue #3701 is open, unassigned, and has no open owner PR.
- [x] Read ADR-041's merged entity/persistence decision, `BrainRegistry`, current chat/session persistence, docs, tests, and shared lessons.
- [x] Define the smallest entity/repository API that satisfies the merged design without query or dispatch integration.
- [x] RED: add focused tests for creation, repeated-interaction persistence, workspace isolation, and backward-compatible migration; verify expected failures.
- [x] GREEN: implement versioned `BrainConversation` plus workspace-scoped durable persistence and registry namespace support.
- [x] Update architecture, onboarding/package documentation, and ADR implementation status where applicable.
- [x] Run focused package tests and repository typecheck, lint, build, and relevant docs tests.
- [x] Self-review the diff for scope, compatibility, persistence safety, and test quality; address independent findings for file permissions, comms adoption, and projection journaling.
- [x] Commit with the required identity, push, and open one PR with `Closes #3701`.
- [ ] Drive CI and current-head Codex review to clean with zero unresolved Codex threads. (Fifth/final round returned two P1 plus three correctness findings; fixes are locally verified and await approval-routed push/thread resolution.)
- [ ] Merge the green/clean PR, verify issue closure, post root evidence, and append reusable shared lessons.
