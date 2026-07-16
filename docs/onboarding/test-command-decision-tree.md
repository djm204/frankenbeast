# Test command decision tree

Use this decision tree before handing a branch to review. Pick the narrowest command that proves the touched surface, then add the next broader gate when the change crosses a package or root boundary.

## Quick decision tree

1. **Did you only change onboarding/docs copy?**
   - Run the focused docs verifier for the issue or file you touched, for example:
     ```bash
     npm run test:root -- tests/docs-issue-1772.test.ts
     ```
   - If the doc references a live root script, also verify the script exists in `package.json` or run the nearest metadata guard that checks it.

2. **Did you change root scripts, CI metadata, Turbo config, or repository guardrails?**
   - Run the focused root test that covers the changed metadata:
     ```bash
     npm run test:root -- tests/<focused-root-test>.test.ts
     ```
   - Add the relevant root guard when the change affects it:
     ```bash
     npm run lint
     npm run typecheck
     ```

3. **Did you change one package's runtime or tests?**
   - Run that package's targeted test and typecheck scripts:
     ```bash
     npm test --workspace @franken/<package>
     npm run typecheck --workspace @franken/<package>
     ```
   - If the package consumes generated workspace exports, build its dependencies first. A common fresh-checkout prerequisite is:
     ```bash
     npm run build --workspace @franken/types
     ```

4. **Did you change shared types or cross-package contracts?**
   - Build the shared types package, then run the consuming package checks named by the ownership manifest:
     ```bash
     npm run build --workspace @franken/types
     npm run typecheck
     ```

5. **Did you change integration, eval, E2E, or live-benchmark behavior?**
   - Use the explicit opt-in suite for that surface instead of assuming default `npm test` covers it:
     ```bash
     npm run test:integration
     npm run test:eval
     npm run test:e2e
     npm run test:live:bench
     ```

6. **Are you preparing a CI-equivalent local handoff?**
   - Use the aggregate CI test target after the narrower checks pass:
     ```bash
     npm run test:ci
     ```
   - `test:ci` intentionally excludes Docker smoke, security/dependency audits, lint, live benchmarks, and the broader orchestrator E2E gate; run those separately when you changed those surfaces.

## Negative and edge cases

- Do not use `npm run build:all` or `npm run test:all`; they are not root scripts in this repository.
- Do not use `test:eval`, `test:e2e`, or `test:live:bench` as default smoke checks. They are opt-in suites for changes that touch those surfaces.
- Do not treat a dry-run task graph as enough evidence by itself. Pair dry-run selection with at least one real command when the touched surface is executable.
- Do not run package scripts from a stale shell directory. Prefix directory-sensitive commands with the repository root or package path when handing commands to another worker.
- Do not broaden a docs-only issue into package refactors just to make a test command exist; add a focused docs verifier instead.

## PM/worker handoff shape

Include the decision, exact command, and result in PRs and Kanban handoffs:

```text
Test decision: docs-only onboarding change, so focused root docs verifier plus no package runtime gate.
Commands: npm run test:root -- tests/docs-issue-1772.test.ts
Result: passed locally.
Broader gates skipped: package typecheck/build not touched; test:ci left to CI.
```
