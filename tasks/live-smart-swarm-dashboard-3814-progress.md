# Live Smart-Swarm Dashboard #3814 Progress

- [x] Reconcile issue #3814 acceptance criteria, the authorized stacked base, and sibling ownership.
- [x] Trace the normalized runtime API/capability contract and existing dashboard routes/components/tests.
- [x] Add one failing behavioral test for the first end-to-end dashboard slice and verify expected RED.
- [x] Implement the minimal first slice and verify GREEN.
- [x] Repeat RED→GREEN vertically for loading, empty, degraded, unsupported, auth, and reconnect states.
- [x] Repeat RED→GREEN vertically for provider switching, bounded topology, duplicate-key safety, evidence panels, and capability-driven controls.
- [x] Verify production paths have no fixture/demo/synthetic fallback and do not touch Hive Brain files.
- [x] Run focused runtime/web tests, the complete web suite, lint, typecheck, and build gates.
- [x] Perform browser/live verification against real Hermes-backed endpoints where available.
- [x] Rebase onto the latest published #3821 head `7ab5c52f429311f8bd247769dfa3a289a2f44302` and re-run relevant gates; upstream exact-head Codex/CI closure is still pending.
- [x] Commit with David Mendez identity, push, and open one linked PR without merging.
- [ ] Run the real GitHub @codex review loop to exact-head clean with zero unresolved threads; round nine returned five findings, all fixed locally under RED→GREEN, and the next exact-head review remains outstanding.
- [ ] Verify exact-head CI is green and record evidence on the PM/root cards.
- [ ] Request human review through the Kanban lifecycle with a structured handoff.

Verification note: `npm test` was also run at the repository root after the rebase. All non-orchestrator workspaces passed; the existing orchestrator suite reported 10 unrelated failures (timeouts plus network/run test pollution), while the 35 normalized-runtime tests and all 779 web tests passed in isolation.

Final-base verification note: after rebasing onto exact #3821 head `9d7393fa76f2c00ddbbc2ceb9010d287550eac4e`, focused smart-swarm coverage passes 33/33, the complete web suite passes 799/799, root lint reports zero errors (pre-existing warnings only), and root typecheck/build plus `git diff --check` pass. Publication and exact-head Codex/CI evidence remain outstanding.

Round-four verification note: current-head Codex findings now reconcile removed workspace selections, preserve parent/dependency semantics, terminate auth-failed streams as unavailable, scope empty-state copy to the selected workspace, and rate-limit expensive topology reconciliation. Focused tests pass 36/36, the full web suite passes 803/803, and root lint (zero errors), typecheck, build, and `git diff --check` pass. Publication, thread resolution, and the next exact-head Codex result remain outstanding; GitHub CI still does not attach to stacked PRs whose base is not `main`.

Round-five verification note: findings now preserve provider-wide snapshots when workspace discovery is unsupported, isolate live refresh scheduling from cancelled provider requests, expose explicit topology refresh for snapshot-only providers, and select the newest unfinished run. Focused tests pass 40/40, the full web suite passes 807/807, and root lint (zero errors), typecheck, build, and `git diff --check` pass. Publication/thread resolution remain outstanding; exact-head Codex is capped and GitHub CI still does not attach to this non-`main` stacked base.

Round-six verification note: findings now preserve a selected workspace through unsupported scoped discovery, rank blocked/running/ready work before truncating dense nonterminal topologies with priority/recency tie-breakers, and apply bounded exponential backoff with jitter to repeated stream-ticket failures. Focused tests pass 41/41, the full web suite passes 808/808, and root lint (zero errors), typecheck, build, and `git diff --check` pass. Publication, thread replies/resolution, and the next exact-head Codex result remain outstanding; GitHub CI still does not attach to this non-`main` stacked base.

Round-seven verification note: findings now keep provider-discovery errors separate from snapshot failures, move task-detail focus into the modal and restore it to the trigger, reconnect after malformed activity payloads, and discard stale replay cursors after repeated pre-open failures. Focused tests pass 45/45, the full web suite passes 812/812, and root lint (zero errors), typecheck, build, and `git diff --check` pass. Publication, thread replies/resolution, and the next exact-head Codex result remain outstanding; GitHub CI still does not attach to this non-`main` stacked base.

Round-eight verification note: findings now clear provider-scoped state when provider discovery replaces the active runtime, ignore callbacks from superseded EventSource instances, index active task runs in one pass, rank recent blockers and pending approvals before evidence caps, trap focus and support Escape in the task-detail modal, and sort activity before its live cap. Focused tests pass 49/49, the full web suite passes 816/816, and root lint (zero errors), typecheck, build, and `git diff --check` pass. Publication, thread replies/resolution, and the next exact-head Codex result remain outstanding; GitHub CI still does not attach to this non-`main` stacked base.

Round-nine verification note: findings now derive degraded runtime status from the current snapshot, exclude terminal runs whose optional `finishedAt` is null, isolate workspace-catalog errors from topology failures, prefer usable workspaces during automatic selection, and rank blocked/running agents before the visibility cap. Focused tests pass 41/41 and package typecheck plus `git diff --check` pass before the required final upstream rebase. Publication, full gates, thread replies/resolution, and the next exact-head Codex result remain outstanding; successor card `t_f0d40218` is still moving PR #3821.

Round-ten verification note: rebased the full #3814 stack onto published upstream PR #3821 head `7ab5c52f429311f8bd247769dfa3a289a2f44302` without conflicts. The focused suite passes 41/41, the full franken-web suite passes 817/817 across 85 files, and root lint (zero errors), typecheck, build, plus `git diff --check` pass. Browser validation at `http://127.0.0.1:4174/#/smart-swarm` rendered the provider/workspace controls and explicit backend-disconnected `Smart-swarm unavailable / HTTP 404` state with zero JavaScript console errors. Force-with-lease publication is waiting for explicit human approval because preflight found 23 changed files (80 deleted lines) relative to remote head `a8a9d7db81db2121c4d240869f9ad2c8b1529a09`, exceeding the 20-file auto-force threshold.
