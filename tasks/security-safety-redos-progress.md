# Security SafetyEvaluator ReDoS Progress

- [x] Inventory open GitHub security issues and select highest-priority actionable patch.
- [x] Isolate work in a clean worktree on `fix/security-safety-evaluator-redos` from `origin/main`.
- [x] Reproduce issue #49 with failing tests for invalid and malicious regex patterns.
- [x] Implement regex validation/error handling and safe evaluation behavior.
- [x] Run targeted tests and package-level verification.
- [x] Commit the fix with a conventional commit message.
- [x] Update/triage GitHub issue #49 with implementation status.

## Notes

- Selected #49 first because it is an open `security` issue with HIGH severity and direct code-level exploitability (user-supplied regex -> ReDoS/syntax errors).
- Other open security issues to revisit afterward: #44, #48, #65, #76, #83, #84.
- RED verification: `npm test --workspace @franken/critique -- --run tests/unit/evaluators/safety.test.ts` failed for malformed regex throwing and nested quantifier pattern passing unflagged.
- Implementation rejects unsafe rule patterns before evaluation, handles invalid regexes as findings instead of throwing, and avoids echoing raw safety rule patterns in findings.
- Independent review initially found bypasses for brace quantifiers, grouped nested quantifiers, grouped alternation, and named capture alternation; follow-up patches added scanner propagation plus regression coverage for those cases.
- Codex review on first pushed commit flagged broad alternation false positives and missing `?` quantifier detection; local patch narrowed alternation rejection to overlapping alternatives, added `?` support, and added safe alternation regression coverage.
- Codex review on current commit flagged fixed-inner-quantifier false positives; local patch now treats exact `{n}` quantifiers as fixed while preserving variable `{m,}` / `{m,n}` rejection, with regression coverage for `(?:\\d{2})+` and `(ab{3})+`.
- GREEN verification:
  - `npm test --workspace @franken/critique -- --run tests/unit/evaluators/safety.test.ts` (14 passed)
  - `npm run build --workspace @franken/critique`
  - `npm run lint --workspace @franken/critique`
  - `npm test --workspace @franken/critique` (123 passed)
  - Independent focused review passed with no security concerns or logic errors.
- PR opened: https://github.com/djm204/frankenbeast/pull/302. Latest local changes need amended force-with-lease push and another Codex pass.
