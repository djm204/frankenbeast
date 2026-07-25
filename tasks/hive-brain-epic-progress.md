# Hive Brain epic progress

Last audited: 2026-07-25T19:01:41Z against `origin/main` at
`dff353f96168374efd439c9abf486b360f4a327e` and live GitHub state for
`djm204/frankenbeast`.

## Scope

- Epic issues: #3685-#3706.
- Excluded: #3692, which is an unrelated reliability issue.
- Tracking parents: #3686, #3687, #3688, #3690, and #3691.
- No audited Hive Brain issue carries a `good first issue` label.

## Closure policy

Each implementation row must have one closed issue, one merged issue-closing PR
present on `origin/main`, successful acceptance/docs evidence, and no unresolved
blocking-class defect. The dedicated Hive Codex cap policy applies to historical
merged heads: at or beyond the review cap, one current-head/main audit replaces a
fresh review waterfall. Only P0/P1, security/privacy, data-loss, or
acceptance-contract defects block the dependency chain. Independent P2/P3,
performance, design, and out-of-scope findings are dispositioned into deduplicated
follow-up issues and do not keep tracking parents open.

A blocking defect discovered after merge requires a scoped remediation PR. That
remediation must link the original issue/PR, fix every blocking finding, pass
required checks, receive the bounded review evidence required for its own head,
have zero unresolved review threads, and merge to `origin/main` before the epic
can pass final verification.

| Issue | PR | Merge/check evidence | Cap-policy disposition | Gate |
| --- | --- | --- | --- | --- |
| #3685 | #3740 | merged; 4/4 passed | clean reviewed head | pass |
| #3689 | #3775 | merged; 4/4 passed | seven late findings include P1 privacy/right-to-forget defects; canonical remediation t_fd5ece5d is active | blocked |
| #3693 | #3743 | merged; 4/4 passed | clean reviewed head | pass |
| #3694 | #3746 | merged; 4/4 passed | current-main blocking-class audit; zero unresolved threads | pass |
| #3695 | #3742 | merged; 4/4 passed | clean reviewed head | pass |
| #3696 | #3745 | merged; 4/4 passed | clean reviewed head | pass |
| #3697 | #3744 | merged; historical 3/4 | failed job was unrelated docs metadata drift and is superseded on current main; four P2/P3 threads dispositioned to #3784-#3787 and resolved | pass |
| #3698 | #3760 | merged; 4/4 passed | current-main blocking-class audit; zero unresolved threads | pass |
| #3699 | #3771 | merged; 4/4 passed | current-main blocking-class audit; zero unresolved threads | pass |
| #3700 | #3741 | merged; 4/4 passed | clean reviewed head | pass |
| #3701 | #3772 | merged; 4/4 passed | current-main blocking-class audit; zero unresolved threads | pass |
| #3702 | #3778 | merged; 4/4 passed | current-main blocking-class audit; zero unresolved threads | pass |
| #3703 | #3777 | merged; 4/4 passed | current-main blocking-class audit; zero unresolved threads | pass |
| #3704 | #3757/#3763 remediation | merged; 4/4 passed | blocking findings repaired; zero unresolved threads | pass |
| #3705 | #3776 | merged; 4/4 passed | clean reviewed head | pass |
| #3706 | #3774 | merged; 4/4 passed | current-main blocking-class audit; zero unresolved threads | pass |

## PR #3744 historical-check disposition

The failed `build-test-lint (1337)` job on PR #3744 was not a planning-faculty
acceptance failure. It failed only because `tests/docs-issue-2880.test.ts` found
that the contributor package list omitted `franken-brain`. On current main the
same focused test passes (2/2), the docs contain no unresolved merge markers,
and PR #3783's full `build-test-lint (1337)` run passes from the audited main
base. The four late review findings were P2/P2/P3/P2; they are now answered,
resolved, and tracked without duplication as #3784, #3785, #3786, and #3787.

## Tracking-parent status

- [x] #3686 closed after #3693 and #3694 were verified closed/merged.
- [x] #3687 closed after #3695, #3696, and #3697 were verified closed/merged and #3744's non-blocking late findings were dispositioned.
- [x] #3688 closed after #3698 and #3699 were verified closed/merged.
- [x] #3690 closed after #3700, #3701, #3702, and #3703 were verified closed/merged.
- [x] #3691 closed after #3704, #3705, and #3706 were verified closed/merged.

## Remaining epic blocker

Issue #3689 is closed by merged PR #3775 with four green checks, but its seven
late review findings include P1 privacy/right-to-forget and persistence defects.
Canonical worker t_fd5ece5d is actively repairing that singular scope in
`fix/hive-pr3775-post-merge-findings-v2`. Final epic verification must remain
blocked until that remediation chain is merged, all original findings have an
auditable disposition, and the bounded follow-up gate has zero unresolved
threads.

## Next actions

- [ ] Let singular owner t_fd5ece5d finish the #3775 blocking-class remediation; do not duplicate its edits or review triggers.
- [ ] Merge this audit PR only after normal human review and green exact-head checks; do not use it to bypass the remediation dependency.
- [ ] Re-audit live main, the remediation PR, and fully paginated review threads before promoting final verifier t_470e10d7.
