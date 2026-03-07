# Discovered Gaps

Gaps identified during E2E proof implementation (Chunk 11).

## From Code Review (pre-runtime)

### 1. Piped stdin + review loop interaction (severity: medium)

The CLI creates a `readline` interface via `createStdinIO()`. When the E2E test
spawns frankenbeast as a subprocess and pipes `"y\n"` to stdin, the review loop
should accept it. However, `readline` on a non-TTY pipe may behave differently
(e.g., closing stdin triggers EOF, which could abort the readline before the
review loop reads it). Needs runtime validation.

### 2. No `--non-interactive` flag (severity: low)

The CLI has no flag to skip review loops entirely. For CI/E2E usage, piping
stdin works but a `--non-interactive` or `--auto-approve` flag would be cleaner.
Not blocking, but would improve testability.

### 3. Build required before E2E (severity: low)

The E2E test spawns `node dist/cli/run.js` which requires `npm run build`
first. The verification command uses `tsc --noEmit` (typecheck only, no emit).
E2E runs need a separate build step. Consider adding a `pretest:e2e` script.

## From Runtime (post-execution)

_No runtime gaps yet — E2E test has not been executed with `E2E=true`._
_Run with `E2E=true npx vitest run test/e2e/e2e-pipeline.test.ts` and update._
