# Issue #3657: ConcisenessEvaluator Input Bounds - Progress Checklist

Implementation checklist for resolving Issue #3657 (Bounding `ConcisenessEvaluator` scans for large inputs).

## Acceptance Criteria

- [x] Define `MAX_INPUT_BYTES = 500_000` (500 KB) constant in `packages/franken-critique/src/evaluators/conciseness.ts`.
- [x] If `input.content.length > MAX_INPUT_BYTES`, truncate the content to `MAX_INPUT_BYTES` before line splitting and comment checks, ensuring predictable memory and CPU usage.
- [x] Unit tests in `packages/franken-critique/tests/unit/evaluators/conciseness.test.ts` verify early truncation and correct behavior under oversized inputs (>500KB).
- [x] All package tests in `packages/franken-critique` pass cleanly.

## Checklist

- [x] Create progress document at `tasks/issue-3657-conciseness-bounds-progress.md` <!-- id: 0 -->
- [x] Add unit tests for oversized input (>500KB) handling in `packages/franken-critique/tests/unit/evaluators/conciseness.test.ts` <!-- id: 1 -->
- [x] Implement `MAX_INPUT_BYTES` bound and truncation in `packages/franken-critique/src/evaluators/conciseness.ts` <!-- id: 2 -->
- [x] Run vitest suite for `packages/franken-critique` to confirm all 17 test files pass <!-- id: 3 -->
- [x] Run `npx tsc --noEmit` to verify type safety <!-- id: 4 -->
- [x] Commit changes, push branch, open PR, and run task-end review loop <!-- id: 5 -->
- [x] Mark progress checklist complete <!-- id: 6 -->

