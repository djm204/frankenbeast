# Issue #3672: ActivityPane ARIA Region Role - Progress Checklist

Implementation checklist for resolving Issue #3672 (Adding missing ARIA landmark role to `ActivityPane`).

## Acceptance Criteria

- [x] Add `role="region"` to the `<section>` container in `packages/franken-web/src/components/activity-pane.tsx`.
- [x] Add component unit tests in `packages/franken-web/tests/components/activity-pane.test.tsx` verifying that `role="region"` and `aria-label="Activity"` are rendered.
- [x] All tests in `packages/franken-web` pass cleanly.

## Checklist

- [x] Create progress document at `tasks/issue-3672-activity-pane-aria-role-progress.md` <!-- id: 0 -->
- [x] Add component unit test in `packages/franken-web/tests/components/activity-pane.test.tsx` <!-- id: 1 -->
- [x] Update `ActivityPane` component in `packages/franken-web/src/components/activity-pane.tsx` <!-- id: 2 -->
- [x] Run vitest test suite for `packages/franken-web` <!-- id: 3 -->
- [x] Run `npx tsc --noEmit` to verify type safety <!-- id: 4 -->
- [x] Create feature branch, commit, push, and open PR <!-- id: 5 -->
- [x] Mark progress checklist complete <!-- id: 6 -->

