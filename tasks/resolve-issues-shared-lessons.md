# Resolve Issues Shared Lessons

## 2026-07-14 — Type-safety hardening regressions
- For removing unsafe TypeScript double-casts, pair the runtime regression with a source-inspection guard that names the exact bypass (`as unknown as ...`) and the intended type-coupling construct (`satisfies z.ZodType<...>` or typed null-object helpers) so future changes cannot silently reintroduce the cast while preserving behavior.
- Disabled/null-object implementations should return structurally complete domain objects rather than partial objects cast through `unknown`; include required lifecycle/status/time fields in the helper so `tsc --noEmit` enforces drift against upstream type changes.

## 2026-07-14 — Right-to-forget privacy/code-review hardening
- For deletion/right-to-forget flows, compare selectors against both persisted storage rows and the current in-memory overlay; avoid broad stale-instance flushes that can delete unrelated external rows, and keep persisted/runtime deletion finalization rollback-safe.
- Redact destructive privacy selectors before every audit/governance sink, including proxy/envelope validation failures and governor logs; if a tool is destructive, route it through the same governance path as sibling deletion tools rather than exempting it as non-executing data.
- Deletion guards should cover source-scope key segments and replay/hydrate should install guards before restoring user data, while allowing the tool’s own right-to-forget audit event to round-trip without blocking hydration.
- After Codex review on right-to-forget flows, regression-test every reinsertion path it names: stale multi-instance flush, learning-event writes, key-only query matches, episodic step text, substring query semantics, terminal source-scope key segments, checkpoint deletion/guards, and forged audit-event hydration.

## 2026-07-14 — Observer classification verification
- In fresh worktrees, build `@franken/types` before running `@franken/observer` typecheck/build because observer imports generated workspace package exports.
- For runtime-artifact classification/security changes, cover runtime policy immutability, downgrade prevention, warning side effects before rejection, and docs examples that might overclaim redaction semantics before triggering Codex.

## 2026-07-14 — Restore preview conflict detector drift coverage
- Restore preview comparisons must include record metadata (`state`, `updatedAt`) alongside content digests; digest-only equality can hide approval-state or task-timestamp drift that a restore would roll back.
- Treat backup-only approval/session-token records as blocker-severity conflicts, not informational drift, because restoring them can reintroduce stale authorization state that live has already cleared.
- Restore dry-run CLI outputs should be machine-stable JSON with `dryRun: true`, `wouldWrite: false`, summarized blocker/warning/info counts, and explicit operator guidance; keep manifest parsing read-only and fail closed on malformed JSON before any restore path is reachable.

## 2026-07-13 — Lesson contradiction detector Codex edge cases
- For lesson-contradiction heuristics, compare negation per corrective/directive guidance fragment rather than across a whole lesson blob; multi-finding lessons can otherwise mask one reversed clause with an unrelated negated clause.
- Keep high-signal short technical tokens such as `log`, `PII`, `JWT`, `API`, `CLI`, `SQL`, `URL`, and `env` in overlap matching, but avoid ambiguous negation words such as standalone `block` that also appear in affirmative guidance like code blocks.
- When detector comparison uses reviewer finding/suggestion text, also include that guidance in `searchLessons` queries and stable fallback IDs; otherwise runtime retrieval and PM handles drift from the detector semantics.

## 2026-07-13 — Langfuse docs and env-var DX
- For docs that include links from published package pages, prefer links to files that are shipped in the package (e.g., README, changelog). In `@franken/observer`, avoid package-relative links to `docs/` if that directory is not published.
- For local secret setup guidance, recommend `.env`/ignored secret files that match repo policy to reduce accidental staging of keys like `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY`.
- When running Codex review on a refreshed commit, resolve all `chatgpt-codex-connector` inline findings and verify `reviewThreads.isResolved` is true for the relevant threads before treating a second `@codex review` cycle as complete.

## 2026-07-13 — Operator session-token review hardening
- Approval-session tokens must be scoped to the policy actually approved: skill triggers can use selected tool scope, but budget/custom/non-skill approvals should stay task-scoped even when a tool is selected so same-tool actions in other tasks do not bypass prompts.
- Never reuse an approval-session token for fail-closed trigger-evaluation errors; even a valid same-scope token must fall back to a fresh operator prompt when evaluator context/logic throws.
- When a gateway returns an issued approval token, the planner/CoT path needs an explicit state handoff into later rationales; otherwise adapter-level token issuance is documented but not usable by normal planner executions.
- Multi-policy approval prompts must surface every fired policy reason, not just a preferred non-skill trigger, so operators see destructive/HITL skill risk alongside budget or other policy risk.
- If a CoT rationale can carry reusable approval tokens, keep candidate token IDs per prior approval rather than a single overwrite slot; the governor can validate candidates against the current scope and ignore non-matching tokens.
- Built-in typed triggers need explicit context construction. Do not feed rationale-shaped objects into typed triggers such as confidence/ambiguity just because they appear later in the evaluator list.
- Avoid mutable "last generated task" state in CoT approval-token handoff; concurrent planner execution must pass the verified task/rationale scope into token remembrance so tokens are stored under the task that actually produced the approval.
- When a replacement approval token arrives for an expired token, put the new token before the old one for that scope so future rationales recover token reuse instead of repeatedly presenting the stale token first.

## 2026-07-12 — Runtime tool manifest security defaults
- Default new/runtime skill tools to `requiresHitl: true` after schema validation, and preserve explicit `requiresHitl: false` only for reviewed safe tools.
- Validate catalog `toolDefinitions` before creating/writing skill install files; otherwise a failed install can leave a partial MCP skill on disk and accidentally expose unknown runtime tools.
- Regression tests should cover omitted HITL defaulting, explicit safe-tool opt-outs, manifest readback, stale-manifest removal on catalog reinstall and custom install replacement, no-tools MCP alias behavior, and invalid tool manifests leaving no partial install.

## 2026-07-10 — Root test entrypoint filters
- For root Turbo entrypoints that expose package-local optional suites, filter to workspaces with real scripts/tests so `turbo run <task>` does not schedule `<NONEXISTENT>` package tasks. Verify both `--dry=json` task selection and at least one actual root command run; dry-run alone can hide package-local no-test failures.
- If eval/LLM-judge tests are named by directory (for example `src/evals/**/*.test.ts`) rather than `*.eval.test.ts`, update Vitest include/exclude rules so `EVAL=true` discovers them and default `npm test` keeps them opt-in.

## 2026-07-11 — Approval replay command extraction guardrails
- Approval replay commands are model-derived state, not fresh operator input. Keep the replay helper narrow: accept only trimmed single-line printable non-slash command descriptions, fail closed on multiline/control-command payloads, preserve the pending approval, and make operators reject/re-submit an explicit `/run` for overrides.
- Regression coverage should include the low-level replay helper and the HTTP approval route so unsafe payloads do not reach the runtime/LLM and error responses do not echo injected command text.

## 2026-07-11 — Vitest config env-flag regression tests
- For Vitest suite-flag fixes, assert false-like env values (`0`, `false`, `no`, blank) preserve the default unit-test include set in package configs, not just helper return values.
- In Vitest tests, avoid cache-busting variable dynamic imports such as `import(`../vitest.config.ts?case=${...}`)`: Vite cannot statically analyze them. Use a static config import and reset env/argv around each assertion instead.

## 2026-07-10 — Control-plane JSON parse hardening
- In control-plane mutation routes, prefer centralized JSON parsing helpers (`parseJsonBody`) and explicit malformed-body tests; this prevents runtime 500s and keeps manager/runtime calls from running on bad input.

## 2026-07-10 — Codex usage-limit handling in issue-to-PR flow
- If `@codex review` immediately responds with usage-limit, treat it as a hard blocker for the merge gate and stop extra polling. Resume review only after credits are restored and a fresh trigger can produce a current-head clean response.

## 2026-07-10 — E2E API failure skip boundary checks
- Treat provider-only flake as skippable only when the pipeline reached plan/execute phase (`[planner]` or `[martin]`), not on generic setup/auth strings.
- Add an E2E precondition skip only for provider credentials the default E2E CLI invocation can actually use; do not let Gemini-only credentials run the default `claude,codex` path without an explicit provider.
- Keep DNS/provider transport errors such as `ENOTFOUND` skippable after the pipeline boundary so transient provider outages do not look like product regressions.

## 2026-07-10 — W3C tracestate sanitization before serialization
- `parseTracestate`/`formatTracestate` should enforce W3C key/value constraints and member limits before exposing user-controlled values in headers.
- Treat malformed list entries (invalid key grammar, control characters, commas, duplicate keys, oversized members, and member-count overflow) as drop/ignore cases during parse and emit only sanitized key/value pairs on format/inject.
- W3C `tracestate` simple keys must start with a lowercase letter; digit starts are valid only in the tenant portion of multi-tenant keys (`tenant@system`). Values must be printable ASCII, must not contain commas or equals signs, and must not end with a space.
- When clearing sanitized-empty `tracestate` during header injection, delete existing header keys case-insensitively so stale mixed-case `Tracestate` does not leak through.
- For issue-1116, adding targeted regression tests for these edge cases prevented malformed `tracestate` strings from entering outbound headers in observer propagation paths.

## 2026-07-10 — Beast panel dialog portal isolation
- When a modal/alert is portaled from inside a slide-in panel, gate panel-level outside-click and Escape handlers against both existing and new dialog markers (for example `[data-beast-panel-portal]` plus `[data-beast-dialog-layer]`) so cross-branch/merge differences don't regress behavior.
- Normalize pointer event targets before portal detection (handle text nodes and text-node parents) so clicks on dialog copy/titles are still treated as dialog interactions, preventing accidental panel closure.
- Prefer passing explicit fallback labels (`agentLabel ?? agent.id`) into destructive confirmations and cover blank-name paths with regression tests to preserve user-visible context.

## 2026-07-10 — Codex usage limits in review loop
- If `@codex review` immediately returns usage-limit comments, classify the review state as blocked/review unavailable for this round and avoid further triggers. Re-run only after credits/enablement is restored, and prefer a short-lived monitor rather than repeated immediate retries.

## 2026-07-10 — Activity pane runtime event serialization safety
- Render failures from runtime events should never take down the Activity pane. When an event payload is shown in UI, pass it through a tiny safe formatter before `JSON.stringify` so `BigInt`/circular/toJSON-throwing values render deterministically (or a clear fallback) instead of crashing the chat shell.

## 2026-07-10 — Observer replay timestamp validation
- Replay-time timestamp guards should mirror persisted audit-event validation, not just check finite `Date` values. JavaScript accepts parseable malformed values such as impossible dates and date-only strings, so add round-trip ISO instant guards (`new Date(Date.parse(ts)).toISOString() === ts`) before relying on replay durations.

## 2026-07-10 — Deterministic observer negative-path async assertions
- In observer event-driven tests, avoid `setTimeout(0)` or any wall-clock wait when asserting "no side effect" (e.g., webhook not fired below limit). Use a microtask drain helper (`Promise.resolve()` or a shared async-drain utility) so timing is explicit, deterministic, and aligned with whether handlers run synchronously.
- Add a dedicated helper in tests when a fire-and-forget integration must assert non-delivery; this keeps suites stable even if internals switch from direct emits to queued microtasks.

## 2026-07-10 — Parallel planner deadlock guard
- In ParallelPlanner execution, don't allow the "no tasks ready" path to continue silently as success. Keep cycle checks explicit and fail fast with a clear `CyclicDependencyError` (or similar) before running task waves, and add a unit test that proves executor is never called when readiness stalls due to a dependency cycle.
- When `@codex review` is usage-limited, classify it as a blocker state and do not merge until a new trigger can produce a current-head clean response.

## 2026-07-10 — ProcessSupervisor runtime error cleanup
- In `ProcessSupervisor`, clean up child-process listeners and stream resources on runtime `error` events, not just `spawn` failures. Keep map deregistration idempotent and remove `error/exit/close` listeners before invoking user exit callbacks so repeated events cannot double-trigger callback paths.
- Add a regression test that simulates a runtime `error` with a mocked `ChildProcess` and verifies `onExit` is emitted once, `SIGTERM` attempted, and listener cleanup is performed.

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

## 2026-07-10 — Franken-web module numeric config
- Number-input handlers that enforce a minimum greater than one should allow digit-prefix intermediates while typing (for example `3` before `30`) and let final wizard validation reject too-low values before launch.
- Wizard validation for optional module config should validate only when the owning module is enabled, and should guard non-object stale/imported config before checking nested fields so hidden disabled config neither throws nor blocks progression.

## 2026-07-10 — Network stop/restart target validation
- Validate stop and restart target IDs through `filterNetworkServices` before invoking supervisor operations, so unknown names fail fast with 400 instead of becoming no-op successes. Keep this as a shared pattern for all service-targeted control-plane endpoints where missing resources must be surfaced as client errors.

## 2026-07-10 — BeastRunService start failure retries
- When `executor.start()` throws after mutating run state, compare the current attempt id/count to the pre-start snapshot before accepting service-level fallback handling. If a prior attempt is still running, restore live run metadata and rethrow so the live process remains controllable.
- Executor-recorded pre-attempt failures should preserve the executor's specific stop reason/event while clearing stale run-level `startedAt`, `currentAttemptId`, and `latestExitCode` from older terminal attempts; add retry and duplicate-start regressions before retriggering Codex.

## 2026-07-10 — MCP stdio health probes
- MCP stdio probes need stream-level `stdin` error handlers that defer EPIPE to the process close/timeout path, and Content-Length parsing must buffer bytes rather than UTF-16 strings. Add regressions for clean-exit EPIPE races, explicit initialize error responses before close(0), non-ASCII framed JSON bodies, and split `Content-Length` headers before retriggering Codex.
- For SDK-backed stdio MCP servers, send newline-delimited JSON initialize requests while still accepting framed responses; on explicit initialize error responses, kill the still-running probe child instead of treating generic error status as a reason to skip cleanup.

## 2026-07-10 — Doctor PR #1478 merge-conflict closeout
- A guarded PR can regress from clean to `DIRTY` while waiting for an over-cap Codex decision. Before repeating the same approval blocker, re-check live `mergeStateStatus`; if it is dirty, fast-forward the local PR worktree to the remote head, merge `origin/main`, resolve only the actual conflict, run the narrow affected web/orchestrator checks, push the sync commit, then return to the same current-head Codex/bypass decision gate.

## 2026-07-10 — Network page stale refresh races
- Network action/status refresh fixes need promise-order regressions: cover a superseded action refresh settling before the newer manual refresh, and a hung superseded action refresh where the newer manual refresh settles first.
- Surface Network status refresh failures independently from selected-service log refreshes and initial config loads; slow/hung independent requests must not delay operator-facing status alerts.

## 2026-07-11 — Session-store corruption diagnostics
- Atomic session writes for private transcripts should create temp files with the final restrictive mode up front, not chmod only after writing; preserve existing destination mode and default new session files to restrictive permissions.
- Corrupt-session API diagnostics should expose only operator-useful summaries, not local server paths. When project-filtering diagnostics, keep unknown-project corruptions visible so malformed JSON does not disappear silently after quarantine.

## 2026-07-11 — Chunk snapshot restore corrupt-task ambiguity
- Unscoped chunk-session snapshot restore must fail closed when corrupt task-scoped snapshots could belong to another task for the requested chunk. Normalize encoded task storage keys, keep already-quarantined `*.json.corrupt.*` entries in ambiguity scans, cover generated recovery task IDs (`fix-harden:<chunk>-attempt-*`), and treat opaque task IDs conservatively unless the task key clearly names a different chunk. Parse known generated prefixes (`impl:`, `harden:`, `fix-*`, `cli:`) and compare the extracted chunk exactly; include hyphenated/slash and single-token chunk IDs such as `impl:issue-1`, `impl:define-types`, `impl:issue-10/chunk-1`, and `impl:auth`, but keep opaque namespaced IDs like `task:2` ambiguous and do not let `auth` match `auth-api`.

## 2026-07-11 — Vite Beast proxy documentation examples
- For docs with copyable foreground service recipes, split long-running services into clearly labeled terminals, quote placeholder env values so Bash does not parse `<...>` as redirection, and repeat server-side token exports in every process that needs to inject Beast proxy auth (daemon, chat-server, and Vite dev server).

- 2026-07-12 — Web prompt attachment security: when adding restricted wrappers for untrusted markdown, fence both the file content and any user-controlled metadata such as filenames; sanitized names can still contain markdown/instructions and must not be emitted as trusted prompt text. Detect markdown suffixes after control-character normalization as well as on raw first-line names.
- 2026-07-12 — Franken-web dashboard provider refresh: when a wizard temporarily reuses global dashboard provider store state, hide cached providers during loading/error refresh states and clear the global loading flag if the wizard closes before the refresh settles. Add regressions for stale cached options and cancelled refreshes before re-triggering Codex.

## 2026-07-13 — Governor multi-trigger review regressions
- When a typed trigger context source throws after an earlier promptable policy fired, keep the earlier operator prompt, add the context failure as an additional critical policy, and avoid reusing session tokens for mixed/failure batches. Ambiguity trigger context should default omitted optional flags to false only when at least one ambiguity flag is present, and combined trigger prompts must preserve the maximum severity across all fired policies.

## 2026-07-13 — HTTP error-body safety
- When adding response bodies to thrown/logged HTTP errors, treat the body as untrusted output: redact echoed auth/API-key headers, redact secret-bearing URLs, and cap body reads before buffering or rendering. Include regressions for JSON-style quoted secrets, non-Web stream fallbacks, and exact-at-cap stream bodies before re-triggering Codex.
- For webhook failure diagnostics, add explicit regressions for truncated/unterminated quoted auth fields, short opaque webhook path segments, non-Web body objects, and stalled streams so Codex follow-up rounds have current-head evidence for security-sensitive fixes.
- 2026-07-14 — Network egress guards: guarded fetch wrappers must force manual redirect handling and validate `Location` targets without replaying the original method/body/credentials to a redirected origin; also preserve `redirect: "error"` semantics and classify GitHub archive hosts such as `codeload.github.com` as GitHub.
- 2026-07-14 — Network config additions: when adding new `network.*` schema fields, also add supported paths in `network-config-paths.ts` and unit coverage so `frankenbeast network config --set` and dashboard PATCH flows can update them.
- 2026-07-14 — Egress policy wiring: provider/comms adapters that perform outbound HTTP must receive the live runtime egress policy from their construction routes, not just expose standalone guarded fetch helpers. For SDKs without a first-class fetch injection point, add a narrow wrapper with tests that prove the guarded fetch is active during the SDK request and that global fetch is restored afterward.
