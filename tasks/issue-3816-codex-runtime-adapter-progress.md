# Issue #3816 Codex runtime adapter progress

- [x] Verify authorized workspace, dedicated branch, clean status, Git identity, and exact #3812 stacked base.
- [x] Read issue #3816 and inspect the provider-neutral runtime contract, Hermes adapter, registry, HTTP wiring, and conformance tests.
- [x] Inspect the installed Codex CLI/app-server surface and local state shapes without reading credentials or transcript content.
- [x] Add a failing Codex adapter test for honest capability and unavailable-health reporting.
- [x] Implement the minimal documented app-server client and default registry wiring for provider discovery.
- [x] Add a failing Codex snapshot test for bounded observable sessions/workspaces, redaction, and no fabricated tasks/topology/blockers/approvals.
- [x] Implement normalized Codex snapshot mapping with bounded, cancellable reads and degraded/unavailable states.
- [x] Add a failing Codex event/cursor test for stable polling semantics and malformed cursor rejection.
- [x] Implement bounded normalized events from observable Codex thread metadata without raw transcripts.
- [x] Add shared adapter conformance coverage for Hermes and Codex.
- [x] Run focused tests, package tests, root lint, typecheck, build, and relevant full tests.
- [x] Self-review the complete diff and verify no Hive Brain files or fixture/demo/synthetic production data were introduced.
- [x] Re-check #3812 exact head; rebase only if it changed.
- [x] Commit as David Mendez <me@davidmendez.dev>, push, and open one PR with `Closes #3816`.
- [ ] Trigger real GitHub `@codex review`; resolve accepted findings and all Codex-authored threads.
- [ ] Verify exact-current-head clean Codex, green CI, and zero unresolved Codex threads; do not merge.
- [ ] Post structured handoff to the task, active PM, and root blackboard; block for review.
