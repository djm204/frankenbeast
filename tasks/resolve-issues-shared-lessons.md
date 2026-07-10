# Resolve Issues Shared Lessons

## 2026-07-10 — E2E API failure skip boundary checks
- Treat provider-only flake as skippable only when the pipeline reached plan/execute phase (`[planner]` or `[martin]`), not on generic setup/auth strings.
- Add an E2E precondition skip when no configured provider credential env key exists, so setup/configuration failures are surfaced as real regressions instead of being misclassified as API outages.

## 2026-07-10 — Parallel planner deadlock guard
- In ParallelPlanner execution, don't allow the "no tasks ready" path to continue silently as success. Keep cycle checks explicit and fail fast with a clear `CyclicDependencyError` (or similar) before running task waves, and add a unit test that proves executor is never called when readiness stalls due to a dependency cycle.
- When `@codex review` is usage-limited, classify it as a blocker state and do not merge until a new trigger can produce a current-head clean response.

## 2026-07-09 — Franken-web beast wizard catalog data
- When backend beast definitions expose interview prompts, drive cards, labels, validation, review rows, and launch config from the catalog instead of adding one-off hardcoded UI branches. Preserve old aliases (`docPath`, `chunkDir`, `topic`) only as compatibility fallbacks while preferring backend field names (`designDocPath`, `chunkDirectory`, `goal`).

## 2026-07-06 — Critique scanner edge cases
- Dependency/comment/string scanners that manually skip regex literals must cover keyword-prefixed regexes (including await), postfix-operator division, JSX closing tags, template interpolations, and import trivia comments. Add regression tests for each Codex-reported lexical edge case before re-triggering review.

## 2026-07-06 — Hook script DB path quoting
- Hook script generation must never interpolate DB path via raw JSON/string values. Use shell-safe single-quote encoding (`'\''`-style escaping) for shell assignments so workspace names containing `$`, backticks, spaces, or single quotes cannot execute arbitrary command-substitution when hooks run.

## 2026-07-08 — Late Codex follow-ups after merge
- After merging a PR that had an asynchronous `@codex review` in flight, audit the merged PR again for post-merge Codex comments/inline findings. If Codex reports current-head findings after merge, open a narrowly scoped follow-up PR against main, run the normal CI + `@codex review` gates on that PR, and merge only after the follow-up is clean.

## 2026-07-08 — Externalized test credential edge cases
- When replacing hard-coded test credentials with configurable helpers, treat blank env values as unset, derive invalid/negative auth tokens from the active configured token so they cannot collide, and avoid test-only env overrides that can turn an invalid value into a valid one.

## 2026-07-08 — CLI provider stream-json edge cases
- When normalizing Claude/Gemini CLI stream-json events, track tool emission separately from text so tool-only successful turns do not fail closed. Preserve provider content order for mixed text/tool blocks, preserve whitespace-only assistant text chunks, and add regressions for terminal frames with no text before retriggering Codex.

## 2026-07-09 — Port scanner Codex closeout
- Port/config scanners should include regression cases for plural port maps, arrays with ignored string elements before numeric values, lower-case compound identifiers (`serverport`/`apiport`), generic comma-bearing type annotations, logical assignment defaults, and quoted top-level keys. For type-only suppression, include long/generated interfaces, tuple labels inside generic arguments, and type aliases split after `=` so false-positive fixes do not hide later runtime configs.
- When Codex reports scanner edge cases that the implementation already handles, add focused regression tests proving service-named identifiers (`supportPort`/`transportPort`/`portalPort`), plural tuple parameter types, nested generic type arguments, and duplicate plural containers before replying/resolving those review threads.
- For port-key substring matching, include regressions for ordinary words (`report`, `important`, `imports`, `exports`), plural port containers with metadata (`weight`/`timeoutMs`), same-line interface followed by runtime config, JSX config props, and long class literal fields; regex context-window tweaks can easily regress one of these while fixing another.
- Assignment and quoted-key scanners need the same config-key exclusions and dotted-key coverage as object literal scanners. Add regressions for `module.exports`, `metrics.report`, private `this.#port`, nested `portOptions` metadata, flat `ports` service maps, dotted quoted keys, and matches whose prefix starts inside a comment before retriggering Codex.
- Late PR #1290 Codex rounds can keep surfacing scanner false positives around non-port word roots, regex contexts, type-only conditionals, and metadata containers. Before declaring the port scanner clean, run regression coverage for object-array metadata, all-caps import/export/report/important constants, ordinary words like passport/airport/portfolio, long parameter literal types, ternary fallback configs, conditional type aliases, quoted `portOptions`, singular `portConfig`, comment braces in class fields, and masked comments before plural port maps.
- For port scanners, avoid broad first-match array regexes that can report object-array metadata before key-aware container scans run. Regression packs should cover externalized array ports with numeric metadata, all-caps non-port constants (`IMPORTANT`/`REPORT`/`IMPORT`/`EXPORT`), ordinary embedded words (`passport`/`airport`/`portfolio`), ternary fallback runtime objects, long parameter literal types, regex literals after `else`/`do`, conditional type-alias branches, quoted `portOptions`, singular `portConfig` metadata, comment braces in class type fields, and masked comments before plural maps.
- Current-head PR #1290 Codex follow-ups show port scanner regressions cluster around identifier segmentation (`opportunity`/`portable` vs `importPort`/`REPORT_PORT`), suffixed plural container names (`portsByProtocol`), ignored-range checks at container starts, array metadata under externalized port objects, regex literals after `of`/`in`, multiline generic annotations, and long generated interfaces. Add compact paired positive/negative regressions before retriggering.

## 2026-07-10 — Deterministic Vitest seed mode for CI
- Enabling deterministic Vitest runs in a monorepo must include all package-level Vitest configs (`vitest.config.ts` and integration config variants) so seed setup is consistent across root and package-local test entry points.
- Packages without an existing `vitest.config.ts` need one rather than CI-only CLI injection; Vitest 4 rejects `--setupFiles`, so passing setup through `turbo run test -- --setupFiles ...` breaks every package test task.
- Turbo 2 filters environment variables in strict mode; package tests need seed variables declared in `turbo.json` `globalEnv` or they will silently miss deterministic-mode env from CI.
- Date mocks must preserve constructor/callable `Date()` semantics, keep `Date.now` writable/configurable for `vi.spyOn`, advance with elapsed real time so timeout/backoff/expiry tests do not collapse to a frozen clock, and stay close to wall time so `Date.now()` remains comparable with filesystem mtimes.
- Seeded `Math.random` streams must include a stable Vitest worker id (`VITEST_POOL_ID`/worker env) so parallel workers do not replay identical ID/tmp-path sequences.
- Use `fileURLToPath(new URL(...))` for setup-file paths in Vitest configs, not `.pathname`, so spaces and Windows-style paths remain valid.
- Add one CI matrix leg with `FRANKENBEAST_SEED` set to a fixed value and a deterministic suite check (e.g. `npm run test:root`) before relying on full non-seeded test runs.
- Keep seed tests focused on deterministic invariants (`Date` and `Math.random`) and validate parser/argv handling for path flags separately so opt-in determinism cannot accidentally narrow default suites.

## 2026-07-09 — MCP firewall dynamic config review lessons
- When a proxy/shared adapter needs active project config, pass both explicit `root` and `configPath` through every factory/init path; resolve relative config paths from the project root rather than `cwd`, and add nested-cwd regressions.
- Treat explicit config paths (`--config`/env) as fail-closed: missing explicit security config must throw instead of silently falling back to a default scan tier. Keep only implicit legacy defaults optional.
- User-configured regex filters need positive and negative ReDoS regressions before each Codex round: safe unquantified alternation (`(password|token)`) must still work, while nested quantifiers, quantified alternation, repeated quantified atoms, and bounded nested quantifiers must be rejected before scan evaluation.

## 2026-07-09 — Generic comms gateway hardening
- For generic comms routes, keep authentication before body parsing/size buffering, preserve local-dev by allowing only verified loopback requests when no operator token is configured, and add strict Zod regressions for both auth and malformed payloads. In Zod v3, `z.unknown()` can infer an optional object property; use a required custom schema or explicit post-parse cast when validating required unknown fields such as `rawEvent`.

## 2026-07-09 — Root Vitest CI suite filters
- When promoting `npm run test:root` into CI, keep the default suite deterministic by excluding integration/e2e unless env flags or explicit file paths opt in. Normalize `./`, absolute paths, and `filename:line` filters; skip operands for Vitest options such as `--exclude`, `-t`, and value-taking coverage options before classifying path-looking strings, but leave boolean options such as `--coverage.thresholds.perFile` available to precede explicit test paths.
- Keep static Dockerfile checks in the default root suite while gating only the actual Docker build assertion behind `DOCKER_BUILD=true` or an explicit sandbox Dockerfile test path. Docker-build opt-in should not narrow the root suite to just the Dockerfile test, and Dockerfile test self-detection must skip value-taking option operands just like the root config parser.
- Treat Vitest CLI boolean flags separately from value-taking options when scanning argv for explicit test paths: `--coverage.thresholds.perFile` must not consume the following file filter, while `--coverage.exclude <pattern>` must consume its operand so Dockerfile test paths used as option values do not enable Docker builds.

## 2026-07-10 — Example scaffolding script review edges
- For Bash scaffolding helpers, reject `.`/`..` names even when dots are otherwise allowed, avoid GNU-only `find -printf` in user-facing paths, check symlinked target directories via `target/.` before copying, and assert generated npm scripts actually load the scaffolded `.env`.

## 2026-07-10 — Network stop/restart target validation
- Validate stop and restart target IDs through `filterNetworkServices` before invoking supervisor operations, so unknown names fail fast with 400 instead of becoming no-op successes. Keep this as a shared pattern for all service-targeted control-plane endpoints where missing resources must be surfaced as client errors.
