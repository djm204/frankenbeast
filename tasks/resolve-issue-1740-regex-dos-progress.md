# Resolve issue #1740 — regex denial-of-service hardening

- [x] Read issue and shared lessons.
- [x] Create isolated issue branch/worktree.
- [x] Inventory high-risk untrusted text regex/parser surfaces.
- [x] Add bounded parsing controls for selected scanner/parser paths.
- [x] Add targeted ReDoS/bounds regression tests.
- [x] Run focused tests and relevant lint/typecheck/build gates.
- [ ] Open PR with `Closes #1740`.
- [ ] Run GitHub `@codex review` loop to current-head clean.
- [ ] Merge after CI + Codex clean, update lessons if useful, complete card.

## Verification so far

- `npm run test:root -- tests/unit/hardcoded-secrets.test.ts packages/franken-orchestrator/tests/unit/chat/approval-input.test.ts` (root test runner only discovered `tests/unit/hardcoded-secrets.test.ts`; 21 passed)
- `npm run test --workspace @franken/orchestrator -- tests/unit/chat/approval-input.test.ts` (5 passed)
- `npm run lint:security` (passed)
- `npm run build` (passed)
- `npm run typecheck --workspace @franken/orchestrator` (passed after building workspace dependencies)
- `npm run lint --workspace @franken/orchestrator` (0 errors, pre-existing warnings only)
- `node scripts/check-hardcoded-secrets.mjs` (passed)

## Inventory

- `scripts/check-hardcoded-secrets.mjs`: scans untrusted env examples and production source lines with regexes for environment assignments, string literals, comments, env accesses, and sensitive assignment contexts. Added fail-closed file and line bounds before regex scanning, with parser/input-class findings that do not echo the payload.
- `packages/franken-orchestrator/src/chat/approval-input.ts`: parses model-derived pending approval command text before replay. Existing single-line/control-character guard now also bounds command length and reports parser/input-class context in the error.
- Markdown/link and issue/PR text parsing surfaces were inspected at repository level through search; no focused owner file comparable to the two active untrusted scanner/parser paths was identified for the minimal one-issue diff.
