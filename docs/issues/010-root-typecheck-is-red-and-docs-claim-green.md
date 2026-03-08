# Issue: Root Typecheck Is Red While Progress Docs Still Claim A Green Repo

Severity: high
Area: repo health

## Summary

The root repo currently fails `npm run typecheck`, but the progress docs still claim all tests and phases are complete.

## Intended Behavior

The root verification commands and the documentation should agree on the current health of the repo.

## Current Behavior

- `npm run typecheck` fails across `franken-observer`, `frankenfirewall`, and root integration tests.
- `docs/PROGRESS.md` still reports all phases complete and "ALL PASS".

## Evidence

- `docs/PROGRESS.md:167-183`
- `docs/PROGRESS.md:225-236`
- Reproduction on 2026-03-08:
  - `npm run typecheck`
  - Representative failures included:
    - `franken-observer/src/adapters/sqlite/SQLiteAdapter.ts`
    - `frankenfirewall/src/server/middleware.ts`
    - `tests/integration/circuit-breakers.test.ts`

## Impact

- The documented project status is no longer trustworthy.
- Contributors cannot use the root typecheck command as a quality gate.

## Acceptance Criteria

- Make `npm run typecheck` green.
- Add CI coverage for the root typecheck command if it is not already enforced.
- Update `docs/PROGRESS.md` so the stated status matches reality.
