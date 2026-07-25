# Hive Brain epic progress

Last audited: 2026-07-25T18:15:52Z against `origin/main` at
`dff353f96168374efd439c9abf486b360f4a327e` and live GitHub state for
`djm204/frankenbeast`.

## Scope

- Epic issues: #3685-#3706.
- Excluded: #3692, which is an unrelated reliability issue.
- Tracking parents: #3686, #3687, #3688, #3690, and #3691.
- No audited Hive Brain issue carries a `good first issue` label.

## Closure gate

A row is terminal only when its issue is closed by exactly one implementation
PR, that merge is present on `origin/main`, all required checks on the reviewed
head succeeded, Codex has clean evidence for that exact head, and all Codex
review threads are resolved. Every implementation PR includes architecture,
onboarding, package, ADR, or task-progress documentation evidence in its changed
files.

If a violation is discovered only after the implementation PR merged, the
historical head cannot be changed. A scoped remediation PR may then satisfy the
gate without becoming a second issue-closing implementation PR only when it
links the original issue and PR, fixes or explicitly dispositions every finding,
passes required checks, receives current-head Codex-clean evidence, has zero
unresolved Codex threads, and its merge is present on `origin/main`. The row must
name that remediation PR before changing to `pass`.

| Issue | PR | On `origin/main` | Required checks | Current-head Codex clean | Unresolved Codex threads | Gate |
| --- | --- | --- | --- | --- | ---: | --- |
| #3685 | #3740 | yes | 4/4 passed | yes | 0 | pass |
| #3689 | #3775 | yes | 4/4 passed | no live clean signal | 7 | blocked |
| #3693 | #3743 | yes | 4/4 passed | yes | 0 | pass |
| #3694 | #3746 | yes | 4/4 passed | no live clean signal | 0 | blocked |
| #3695 | #3742 | yes | 4/4 passed | yes | 0 | pass |
| #3696 | #3745 | yes | 4/4 passed | yes | 0 | pass |
| #3697 | #3744 | yes | 3/4 passed; `build-test-lint (1337)` failed | no live clean signal | 4 | blocked |
| #3698 | #3760 | yes | 4/4 passed | no live clean signal | 0 | blocked |
| #3699 | #3771 | yes | 4/4 passed | no live clean signal | 0 | blocked |
| #3700 | #3741 | yes | 4/4 passed | yes | 0 | pass |
| #3701 | #3772 | yes | 4/4 passed | no live clean signal | 0 | blocked |
| #3702 | #3778 | yes | 4/4 passed | no live clean signal | 0 | blocked |
| #3703 | #3777 | yes | 4/4 passed | no live clean signal | 0 | blocked |
| #3704 | #3757 | yes | 4/4 passed | no live clean signal | 0 | blocked |
| #3705 | #3776 | yes | 4/4 passed | yes | 0 | pass |
| #3706 | #3774 | yes | 4/4 passed | no live clean signal | 0 | blocked |

“Current-head Codex clean” requires a bot-authored clean comment naming the PR
head or an equivalent positive bot reaction for that review round. A review
wrapper, an `eyes` reaction, a worker handoff, or zero unresolved threads alone
does not satisfy the gate.

## Tracking-parent status

- [ ] #3686 remains open: child #3694 / PR #3746 lacks current-head Codex-clean evidence.
- [ ] #3687 remains open: child #3697 / PR #3744 has a failed required check, lacks current-head Codex-clean evidence, and has four unresolved Codex threads.
- [ ] #3688 remains open: child PRs #3760 and #3771 lack current-head Codex-clean evidence.
- [ ] #3690 remains open: child PRs #3772, #3778, and #3777 lack current-head Codex-clean evidence.
- [ ] #3691 remains open: child PRs #3757 and #3774 lack current-head Codex-clean evidence.

## Additional epic blocker

Issue #3689 is already closed by merged PR #3775, but the PR has no current-head
Codex-clean signal and still has seven unresolved current-head Codex threads,
including P1 right-to-forget/persistence findings. The root epic must not be
reported complete while those findings remain unresolved.

## Next actions

- [ ] Repair or disposition every unresolved Codex finding on PRs #3744 and #3775 in follow-up PRs because the original PRs are merged.
- [ ] Establish fresh current-head Codex-clean evidence for every row marked blocked.
- [ ] Obtain a green, current-head remediation chain for the failed `build-test-lint (1337)` gate on #3744 through a scoped follow-up.
- [ ] Re-audit live checks, Codex comments/reactions, and fully paginated review threads.
- [ ] Close tracking parents only after every listed child passes the closure gate.
