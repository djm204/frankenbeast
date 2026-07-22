# Resolve Issues Shared Lessons

## 2026-07-22 — Post-tool authorization and nested-string redaction
- Use separate redaction modes for executable pre-tool shell context and inert post-tool output: shell assignments must stop at the first token so governance still sees the command, while post-tool output can consume known structured multi-token authorization values.
- Authorization redaction must treat quoted header values and structured multi-token schemes (including AWS `Credential`/`SignedHeaders`/`Signature` parameters) as one secret-bearing value while stopping before shell control/substitution boundaries.
- JSON sanitizers must recurse when the top-level parsed value is itself a string, recognize sensitive header-entry tuples such as `["Authorization", value]`, and preserve duplicate-key fallback boundaries; object-key-only recursion and line-greedy raw replacements can either miss credentials or erase later JSON fields.
- Oversized-payload indicator scans must recognize escaped JSON keys (for example `\"apiKey\":`), authorization header tuples, and singular as well as plural credential keys before deciding that a payload is safe to persist unchanged.
- In inert post-tool output, Authorization and Cookie header redaction should consume complete line values (including semicolon-delimited SigV4 parameters or multiple cookies) but stop at unescaped JSON field boundaries when processing duplicate-key raw fallbacks.

## 2026-07-22 — Deterministic root release repair
- When repairing GitHub's latest-release marker in a multi-package repository, fetch a bounded but churn-tolerant release window with explicit draft/prerelease exclusion, filter only bare root semver tags, and sort parsed numeric version tuples instead of trusting API creation order. Resolve the replacement candidate before demoting the current latest release so an empty bounded result fails without leaving the repository markerless.

## 2026-07-22 — Shared chat command completion catalogs
- When adding interactive completion for chat commands, derive or cross-check the catalog against every command accepted by the shared runtime, not only the commands handled locally by one CLI wrapper. Approval commands such as `/approve` and `/reject` can be runtime-owned even when the readline layer has no dedicated branch; keep both attached and local chat interfaces on one completer and test paired command prefixes explicitly.

## 2026-07-21 — Dashboard chat model precedence
- For conversational dashboard replies, the selected provider's `providers.overrides.<provider>.model` wins over `chat.model`; `chat.model` only replaces the provider's built-in chat model when no selected-provider model override exists. Dashboard `/run` uses a separate execution adapter that ignores both model settings and provider `extraArgs`, although it does apply trusted command overrides. Trace both adapter construction paths and runtime provider override resolution before documenting dashboard behavior.

## 2026-07-20 — Episodic JSON quarantine reads
- When an optional persisted JSON payload is corrupt, preserve the valid row envelope and replace only that payload with explicit quarantine metadata; thread the row id into read-audit diagnostics across every query path, including nested empty-query and encrypted scans, so operators can repair the exact record without losing timeline evidence.
- Treat quarantine metadata as diagnostics, not domain content: exclude it from encrypted recall scoring, let consumers that count meaningful failure windows backfill past quarantined rows, and preserve protected retention classification only in the retention path rather than weakening strict audit validation globally.
- Any consumer whose authorization scope lives inside the quarantined payload must fail closed for every read scope, including privileged `all`; otherwise corrupt private rows are silently reclassified as shared. Plaintext SQL recall must also re-check quarantined rows against their surviving summary so a keyword that exists only in corrupt details cannot produce a false match.
- Snapshot replay should recognize quarantined right-to-forget audit envelopes from their fixed summary plus strict quarantine shape before applying deletion-guard assertions; keep that exception narrow so ordinary quarantined events cannot bypass replay guards.

## 2026-07-20 — Outbound request deadlines must include response consumption
- JavaScript `fetch()` resolves when response headers arrive, not when the body has been consumed. A hard outbound-delivery deadline must wrap both the fetch and all body/error parsing under the same abort signal and timer; otherwise a provider can send headers and stall forever during `json()` or `text()`.
- In fresh monorepo worktrees, run the root build before package-local TypeScript checks so internal workspace declaration outputs exist and unrelated module-resolution errors do not mask the feature result.

## 2026-07-18 — Cron credential scanner closeout
- For cron credential scanners, taint propagation must cover neutral alias names, exported declarations, destructured env containers, env-name variables, multiline assignments, shell indirect expansions, printenv/getenv aliases, and programmatic CLI calls; otherwise hardening that only matches direct `process.env`/`$TOKEN` reads leaves easy PAT-persistence bypasses.
- Cron-context detection should inspect code outside string literals plus actual schedule literals, not diagnostic text that merely says `crontab`; credential assignment parsing must handle quoted values while preserving runtime `$(gh auth token)` as safe.
- Async child-process taint needs both returned child/stdout aliases and callback stdout parameters, including multiline calls; once a multiline alias becomes sensitive, trailing defaults/options must not clear it before the call closes.
- Indirect shell `printenv` names, schedule aliases inside template interpolation, and dotted object-property assignments all require explicit taint propagation; option literals such as `--token` must remain non-sensitive when paired with a runtime `$(gh auth token)` value.
- Multiline TypeScript destructuring, split `process.env` chains, destructured async stdout, and cached `os.environ.get` getters need dedicated alias paths; runtime cron allow-lists should treat `command gh auth token` like direct `gh auth token`.
- When expanding shell-file scanning for cron writers, avoid both basename-only install/setup filters and scanning every shell script blindly; include cron/crontab-named writers while preserving non-cron bootstrap scripts to prevent fixture false positives.
- Separate shell interpolation parsing from JavaScript template interpolation, carry quote/heredoc context across lines, recognize staged crontab files and programmatic crontab sinks, and propagate aliased Python `os.environ`; otherwise a line-oriented scanner both misses persisted credentials and rejects safe runtime `$(gh auth token)` strings.
- Treat cron-install taint as a language-aware dataflow problem: cover post-processed/backquoted `printenv`, wrapped/incrementally assembled `gh auth token`, aliased env imports/containers/sinks, dot/bracket/destructuring/joined interpolation flows, multiline schedules/assembly/programmatic sinks, and redirect/tee/stdin staging while preserving shell URLs and excluding quoted heredoc/escaped runtime expansion.
- Pre-scan bounded source lines for cross-line facts that a single-line taint pass cannot recover reliably: multiline `gh auth token` argv arrays, named callback stdout parameters, default `node:process` imports, command-array crontab sinks, and shell staging through command aliases. Split multiple declarations only at top-level delimiters so commas inside calls, arrays, objects, and strings do not corrupt alias tracking.

## 2026-07-20 — Recovered PID signal-boundary identity checks
- Carry the persisted process-start token into the supervisor and re-read identity immediately before every fallback signal; validating ownership in an upstream executor leaves a TOCTOU gap, especially when a failed process-group sweep falls back to direct PID signaling. If the token is missing, unreadable, unsupported, or mismatched while the PID exists, refuse the signal with operator guidance. An absent PID is a safe no-op for direct signaling, but a persisted owned process group must still be swept because descendants can survive their group leader.

## 2026-07-20 — ESM-compatible inline workers for synchronous native dependencies
- When a package offloads synchronous native calls to an inline worker, do not assume `Worker(..., { eval: true })` provides CommonJS: package `type` and runtime context can make `require` unavailable in the built artifact even when test runners pass. Use an ESM data-URL worker with dynamic imports and verify the compiled `dist` entry point in plain Node, not only source-mode tests.
- Keep idle workers unref'ed, ref them while requests are outstanding, and route every worker response/error through correlated pending requests so asynchronous APIs remain non-blocking without changing process-liveness behavior.
- Preserve adapter invocation order across the worker boundary: serialize reads and deletes behind earlier queued writes, not just write calls, or a read can observe stale state while a preceding write is still retrying.
- Preserve JSON persistence semantics at the worker boundary by serializing metadata and thought blocks before `postMessage`; structured cloning rejects values such as functions that `JSON.stringify` historically omitted. Also remove/ref-clean any pending request when `postMessage` throws synchronously.
- Resolve relative database paths once before opening either the main or worker connection; asynchronous worker startup must not reinterpret a path after `process.cwd()` changes.
- Keep worker startup lock-free after the main connection has initialized persistent WAL/schema state. Re-running DDL or `journal_mode` in asynchronous startup can turn a transient lock into a permanently failed worker before request-level retry logic can run.
- A synchronous public `close()` needs a synchronous worker acknowledgement after the native database handle is closed. A small `SharedArrayBuffer`/`Atomics` handshake preserves the existing API while making immediate reopen, journal changes, and shutdown deterministic; skip that wait after a recorded worker failure so cleanup cannot mask the original error with a timeout.

## 2026-07-20 — Incremental type-aware ESLint adoption
- Enable type-aware rules in a dedicated TypeScript source override with `projectService: true` and an explicit `tsconfigRootDir`; source-adjacent tests excluded from package tsconfig files must be ignored by that override or ESLint fails before rule evaluation.
- A targeted rule such as `@typescript-eslint/no-floating-promises` can establish type-aware coverage without enabling the entire strict preset at once. Treat surfaced promises as real call-site decisions: await work that must finish, use `void` only for intentional fire-and-forget, and add rejection handling for shutdown paths.

## 2026-07-20 — Bounded Beast event paging through corrupt rows
- Recovery pagination must bound raw rows scanned, not only healthy rows returned. Return the last scanned raw sequence plus an indexed `hasMore` probe so a short or empty page can advance past corrupt rows without turning one request into a full-history scan.
- Before wiring a new paginated endpoint into dashboard hydration, trace which detail field the UI actually renders. Do not eagerly collect every page for an unused compatibility field; keep the bounded endpoint available for intentional consumers and preserve fast detail loading.

## 2026-07-19 — Skill HITL configuration boundaries
- Keep the active config path and installed skill root as separate inputs: the active config determines which skills are enabled, while manifests remain anchored to the database/project `.fbeast/skills` directory even when operators supply an external `--config` path.
- Distinguish a valid empty enabled-skill list from malformed/unreadable config. For qualified calls, fail closed only when the action matches an installed skill server or directory alias, so stale custom registrations remain gated without changing policy for unrelated built-in MCP servers.
- MCP action parsing cannot split blindly on the first or last `__`, because both server and tool names may contain double underscores; match configured server-name prefixes and preserve the full remaining tool name.

## 2026-07-19 — Bounded Beast log paging
- A tail endpoint is not operationally bounded if it collects a bounded result after scanning all retained history. Read newest rotations in reverse chunks and stop as soon as the line or byte budget is full; also restrict page reads to configured retention so stale extra rotations cannot re-expand request I/O.
- Treat oversized individual records as consumed pagination entries even when replacing or omitting their payload, or offset clients can become stuck on the same line. For HTTP byte limits, measure the final post-redaction JSON envelope (logs plus page metadata), not only the serialized logs array.

## 2026-07-19 — MCP integer precision validation
- JSON-schema `integer` checks at JavaScript transport boundaries must use `Number.isSafeInteger`, not `Number.isInteger`: integral-valued numbers beyond `Number.MAX_SAFE_INTEGER` can no longer represent exact IDs, limits, or pagination values. Cover both accepted safe boundaries and rejected values immediately outside them.

## 2026-07-19 — Live-bench run cleanup TOCTOU hardening
- For destructive cleanup in attacker-writable directory trees, preflight `lstat`/`realpath` checks are not enough: on POSIX, open the trusted root and each descendant with `O_DIRECTORY|O_NOFOLLOW`, compare root and quarantined leaf device/inode identities, address rename/removal through stable descriptor paths, and keep the recreated run-leaf descriptor open while populating it.
- Create quarantine entries beside the anchored leaf parent so rename stays on one filesystem, and avoid followable path mutations such as `chmod(path)` between creation and a no-follow open. Use `lstat`-based existence checks so dangling symlinks fail closed; when a platform lacks searchable Linux `/proc/self/fd` paths and no equivalent safe primitive is available, reject secure provisioning rather than restoring path-based TOCTOU cleanup.

## 2026-07-19 — Provider-native cache session isolation
- Never translate an application cache/work key into a provider continuation flag. Start the first native-capable cache call without `--continue`, capture the provider-issued session id, and resume only that exact id when provider and model still match.
- Treat only classified stale/invalid-session failures as retryable: emit fallback telemetry, invalidate the stale record before retrying, and retry once in a fresh persisted session; propagate all other provider errors so failures cannot silently double expensive calls.

## 2026-07-19 — Codex-triggered commit re-review on issue #2907
- When a commit is pushed to an existing PR and there was a prior `@codex review`, always trigger a new review on the new head and collect a fresh `@codex review` clean signal before merging. In this case, a `screen-reader` aria-label update changed, a stale strict assertion in `wizard-dialog.test.tsx` broke once; switching it to a regex was sufficient and CI stayed green on the new commit.

## 2026-07-19 — Deterministic abort handling regression
- Prefer deterministic abort fixtures over timing sleeps: for HTTP disconnect behavior, verify both in-band and immediate-abort paths by asserting that `AbortSignal` is already aborted when `request.destroyed`/`request.aborted` is true before app handler execution.
- Use a pre-aborted request object (or equivalent event-driven signal path) in unit tests when asserting handler abort behavior, and keep timeouts only as a bounded safety net, not as fixture synchronization.

## 2026-07-19 — Shared schema typing for websocket event payloads
- Prefer importing socket event unions from shared contract packages and remove local duplicate unions in UI/runtime state modules; add a small source-inspection regression if the duplicate types are the failure mode so future refactors cannot silently reintroduce drift between schema and state handlers.

## 2026-07-19 — Artifact-path TOCTOU hardening
- Returning a validated pathname is not a secure file-inspection API: pin both the workspace directory and artifact as file descriptors, traverse through `/proc/self/fd` or `/dev/fd` where available, and compare descriptor/path identities after opening so rename/symlink swaps fail closed.
- Use `lstat` rather than `existsSync` when dangling symlinks must be rejected, translate only candidate-component `ENOENT` into an ordinary missing artifact, and open untrusted artifact targets with nonblocking/no-follow flags before requiring a regular file.

## 2026-07-18 — Kanban reviewer isolation
- Independent review workers must receive a distinct child card or explicitly review-only context; never let a delegated reviewer inherit and complete the implementation parent card, because completion can garbage-collect its workspace before the verified diff is committed and shipped.

## 2026-07-19 — PR #3270 reviewer fail-closed follow-up
- Symptom: the reviewer could pass raw 39-character Google API keys to the model, let `gh` subprocesses use a stale lower-precedence token, depend on the host locale for emoji-bearing review files, and exit successfully after diff-fetch failures.
- Treatment: match published `AIza` plus 35-character keys before model invocation, force every `gh` subprocess to use the token selected for API calls, write review files explicitly as UTF-8, and accumulate diff-fetch failures while continuing later PRs before failing the run.
- Reusable lesson: security/reliability reviewers must keep credential selection, text encoding, and exit status deterministic across API and subprocess paths; add regressions for mixed token environments, non-default locales, standard secret formats, and partial-batch fetch failures.

## 2026-07-19 — PR #3270 over-cap Codex closeout
- Symptom: each approved current-head Codex round produced actionable findings, so the repaired head advanced after the approved trigger and required another fresh review; green CI and zero unresolved Codex threads did not satisfy the current-head gate.
- Treatment: preserve the existing closeout worker as the sole owner, verify local/upstream/PR head equality, green required checks, CLEAN merge state, zero unresolved Codex threads, and exact trigger count before requesting one bounded additional invocation. Do not retrigger or merge until that explicit approval is recorded.
- Reusable lesson: an over-cap approval is scoped to one trigger and the head it reviews, not to the whole PR. If valid findings move the head, request a new exact-command approval for the next invocation rather than treating the prior approval or resolved threads as transferable.

## 2026-07-18 — Working-memory hydration corruption
- Fail closed on malformed persisted values that are shaped like structured JSON (`{` or `[` after leading whitespace), while retaining the documented plain-text fallback for genuinely legacy rows. Typed hydration errors should identify the affected key without deleting the row, so operators can repair it and reopen the store.

## 2026-07-18 — MCP-owned SQLite lifecycle
- When an MCP server owns or lazily creates a SQLite-backed adapter, expose an idempotent adapter `close()` and connect it to the SDK server's `onclose` path as well as an explicit public server `close()`. Central audit wrappers must forward cleanup, and proxy servers must release both their audit observer and any lazily-created adapter set.
- In fresh monorepo worktrees, build internal workspace packages before package-level TypeScript checks; otherwise missing generated `dist` declarations produce unrelated module-resolution errors.

## 2026-07-18 — MCP execution deadline review fixes
- A `Promise.race` timer cannot preempt synchronous handler work because the event loop is blocked; deadline wrappers must re-check wall-clock time after handler resolution/rejection and convert late completion into the same structured timeout while aborting the supplied signal. Keep that timer ref'ed so in-process callers with no other active handles still receive the timeout result.
- Nested dispatch wrappers must have a deadline strictly longer than the longest inner target deadline, including validation/governance/audit slack, or the wrapper can win the timeout race and lose resolved-target timeout auditing.

## 2026-07-17 — PR #2358 stalled closeout and Codex gate handling
- For stalled PR closeout, re-verify live PR head, mergeability, CI rollup, unresolved Codex threads, and the latest top-level Codex response before acting; a stale green/clean state can become `mergeable=CONFLICTING`/`mergeStateStatus=DIRTY` after main advances even when required CI is still green.
- Treat Codex usage-limit responses as a hard review-gate blocker for the current round: do not repeatedly retrigger `@codex review`, do not treat historical inline finding lists as active blockers when GraphQL review threads are resolved, and wait for restored usage/approved over-cap review before merging.
- When a PR is behind the remote branch or main has moved, fast-forward the existing issue worktree to the PR head before touching files, then resolve only the merge-conflict files with minimal edits; for PR #2358 the known conflict surface included `brain-adapter.test.ts`, `memory.test.ts`, `tool-registry.ts`, and this shared lessons DSM.
- Preserve the one-agent-per-issue policy during doctor/PM closeout: if an existing worktree/card owns the PR, leave evidence-backed handoff comments instead of spawning a duplicate worker or parallel replacement; every PM status comment should explicitly state whether duplicate edits/workers were created.
- DSM/docs-only closeout notes still move the PR head if committed, so after pushing them, re-check CI on the new head and report whether the push was a documentation/lesson-only change versus a code fix.

## 2026-07-17 — Architecture docs package-name consistency
- For docs-only architecture fixes, add narrow regression tests that slice the relevant README/docs sections and assert legacy labels are absent there, rather than banning every historical MOD reference across the repository; configuration/env docs may still need legacy toggles for compatibility.

## 2026-07-17 — Setup healthcheck Codex closeout
- For onboarding setup healthchecks, distinguish pre-service bootstrap from strict local service verification: occupied optional ports should warn with conflict guidance before Docker starts, while `--require-services` can treat expected open ports as healthy. Keep JSON check schemas stable by serializing nullable fields like `action`, and let tests override service URLs so host-running Grafana/Tempo cannot flip optional-service assertions.

## 2026-07-17 — Gitleaks fixture secret hygiene
- Secret-redaction tests that spawn child commands must avoid putting full fixture secrets in the command argv source itself; split PEM headers/footers and token-like values inside the generated command text as well as in test source so Gitleaks does not flag the fixture while runtime output still exercises full secret redaction.

## 2026-07-17 — Service health aggregator verification
- Before running `npm --workspace @franken/orchestrator run typecheck` in a fresh worktree, build internal workspace dependencies first (`@franken/types`, `@franken/observer`, `@franken/brain`, `@franken/critique`, `@franken/governor`, and `@franken/planner`) so typecheck failures reflect the PR diff instead of missing local `dist` declarations.

## 2026-07-17 — Learning sandbox Codex closeout
- For learning sandbox hardening, treat the public execution context as adversarial: freeze exposed policy/declaration objects, keep enforcement copies private, deny namespaced aliases and observer/terminal surfaces (`exec_command`, `write_stdin`, `apply_patch`), and validate callback outcomes before marking a run promotion-eligible.
- Snapshot and fixture-tool containment must reject replaced/symlinked workspace roots before descending, include root/file mode metadata, and persist evidence even when verification fails, getters throw, or workspaces disappear. Use unique short hashed run directories so parallel retries cannot overwrite each other.
- Denylist coverage needs last-segment and dot-namespaced mutation aliases such as `create_file` and `memory.store`, actual client aliases like `Bash`/`Write`/`run_shell_command`, and opaque wrapper entries; denied-tool evidence serialization must avoid invoking hostile `length` getters so blocked calls are recorded before errors can be caught by experiments.
- Before promoting sandbox runs, await all outstanding `runTool` promises and re-anchor custom handlers/workspace/runs-root paths so unawaited async handlers or symlinked ancestors cannot mutate after evidence is marked passing.

## 2026-07-16 — Synthetic availability probe review fixes
- Availability probes should fail closed for real dependencies: do not default provider checks to `node --version` or dashboard checks to a static UI health URL, require explicit provider/backend health targets, and cover missing-target behavior in tests so cron copies cannot produce false-green uptime.
- For cron/CI probe JSON logs, redact both `key=value` and whitespace-separated secret forms, including split `Authorization: Bearer ***` argv sequences, before serializing command details or error messages.
- When Codex reaches the normal five-trigger cap but posts new valid findings, fix/reply/resolve them and stop for explicit approval before issuing another `@codex review`; zero unresolved threads plus green CI is not a substitute for a fresh current-head clean.

## 2026-07-16 — Snapshot diff Codex closeout
- State snapshot diff redaction must cover metadata as well as values: record ids, source filenames, map keys, primitive-map key/value pairs, parse-error/oversized-file paths, and password-only connection URLs (for example Redis URLs with no username) need regression coverage so incident reports cannot leak PII or credentials through supposedly redacted metadata.
- For one-record-per-file snapshot exports, prefer immutable ids when present but fall back to the source path instead of mutable display names such as `name`; otherwise a rename appears as remove+add instead of one changed record. Coalesce identical aggregate/per-record duplicates so missing duplicate exports do not count as state drift.
- For subsystem inference and worker ids, prefer explicit directory segments before filename substrings (`memory/task-notes.json` is memory), and let real worker registry records replace task-extracted worker references instead of suffixing them as duplicate workers.
- For state snapshot diff follow-ups, treat direct approval primitive maps (`approvals.json`/`approvals/pending.json` with token keys) as keyed approval records without misclassifying single approval records, prefer task map/file fallback identity over mutable worker ownership, skip aggregate wrapper metadata once nested collections are extracted, keep explicit subsystem directories authoritative over generic basenames (`memory/state.json` stays memory), recheck byte-size caps after read, wrap directory/file read failures, and pass success/error paths plus parser messages, object keys, ids, and changed-field names through shared redaction so path/key strings with `token=`/`password=` fragments are scrubbed too.
## 2026-07-16 — Memory attribution scope and MCP inventory review fixes
- For hook/governor memory audit closeout, treat `__fbeastHookSource` as reserved provenance on both pre-tool and observer paths: public observer logs must reject forged hook markers, hook JSON wrapping must write trusted provenance after spreading user context, execute_tool audit reports should infer nested memory tools from `args.tool`, and redaction helpers must merge trusted provenance back into sanitized memory export/review-decision contexts.
- MCP memory tooling: adding a new registry tool must update package README combined-server tool counts and `tool-registry.test.ts` aggregate/search count expectations, not only server-specific tests, or full `@franken/mcp-suite` CI fails despite targeted memory tests passing.
- Memory attribution privacy: source-attribution viewers must honor the same `readScope`/`agentId` controls as memory query/frontload and translate internal scoped working keys back to logical keys before returning results; governor redaction for proxied attribution calls should match the narrow attribution-argument shape so ordinary memory store/proposal calls are not over-redacted.

## 2026-07-16 — SQLite lock retry review fixes
- When adding async retries around sync SQLite adapters, serialize all mutating operations that can overlap through one write queue; otherwise a sleeping retry can be overtaken by later flush/delete calls and reintroduce stale rows.
- Capture mutable trace/span payloads before enqueueing delayed SQLite writes, and include statement preparation inside the retry wrapper so schema/contention locks during `prepare()` get the same diagnostics as transaction failures.
- Validate retry/backoff options before opening a native SQLite handle; constructor validation failures should not leak a handle that can keep the database locked.
- Retry initialization pragmas/schema creation too, make diagnostic callbacks best-effort, and defer `close()` until pending queued writes settle so shutdown cannot race an async write tail.

## 2026-07-16 — Queue priority aging
- For issue scheduler aging, score only eligible work with age boosts; blocked/HITL work should carry a large safety penalty and zero age boost so stale unsafe cards never bypass human/dependency gates. Include priority rank, effective rank, age, blocker status, risk lane, freshness, and an explanation string in liveness/fairness output.
- For issue-runner queue-depth/backpressure, count only startable eligible issues; blocked/HITL cards should not inflate queue depth. Defer gated issues before any plan decomposition when no plan chunks already exist, but preserve zero-token completion only for exact one-shot issue checkpoints (`impl:issue-N:done` and `harden:issue-N:done`); chunk-shaped checkpoint keys require plan coverage before completion.
- Issue backlog aging depends on fetching old backlog rows before local score sorting. `gh issue list` must use a backlog-safe high limit and oldest-first search sort by default so stale medium/low issues are not excluded by the GitHub CLI's recent-item window before aging runs.

## 2026-07-16 — Dead-letter queue Codex closeout
- DLQ/DR restore output redaction must cover provider token literals (for example `sk-*`, `xox*`) and credentialed database URLs even when they appear inside free-text fields such as `target`, `lastError`, or nested payload strings; test fixtures should prove output does not leak the original secret substrings.
- For DLQ file locks, treat unparseable lock timestamps as malformed stale-lock candidates and fall back to mtime-based reaping; otherwise a syntactically valid lock JSON with `acquiredAt: not-a-date` can wedge writers forever.
- When reaping malformed DLQ locks, revalidate the moved file identity after `rename` before unlinking so a stale-lock race cannot delete a fresh active lock; when persisting retry exhaustion, normalize blank caller timestamps before writing so later queue reads do not reject the whole DLQ.

## 2026-07-15 — Memory access audit privacy
- Memory access audit hashes should use keyed HMACs, not bare SHA-256, and the tests should assert same-selector stability plus raw-value absence rather than pinning an unsalted digest.
- Keep audit-only HMAC key material separate from exported right-to-forget/deletion guard snapshot keys; audit-only writes must not cause `serialize()` to expose `deletionGuardHashKey`.
- Put sensitive learning/review keys through the audit event `key` hashing field rather than plaintext `details`, and audit deletion-guard rejections before rethrowing so denied writes are visible without leaking selectors.
- When broadening audit coverage, wire every public persisted-memory surface through a shared audit sink (working, episodic learning/recall, recovery checkpoint/clear, review queue/provenance, right-to-forget) and update schema metadata tests for the extra audit/hash-key rows.

## 2026-07-15 — Webhook DNS pinning review fixes
- For outbound webhook SSRF hardening, validate object-form allowlist origins for credentials too; URL normalization can otherwise hide deceptive `userinfo@host` entries.
- When a webhook hostname is DNS-validated before delivery, the actual transport must consume the validated address: custom fetches should receive an IP-pinned URL plus original Host header, default HTTPS should try later validated addresses after network failures, and pinned HTTPS error bodies need async-iterable response coverage.

## 2026-07-15 — High-risk governor policy review fixes
- When adding policy-as-code for high-risk action classes, wire the class map into every shared governor path before non-executing exemptions; otherwise new classes can exist in the policy module but never gate hook/public/central checks.
- For memory governance evidence, pass only selector/dry-run/profile fields into hook/governor context and redact selectors before logging; never serialize full memory tool payloads because schema-rejected extras or stored values can leak secrets into governor logs.
- High-risk shell-command inference must parse common CLI variants, not just simple substrings: allow read-only GitHub inspection (`gh issue/pr view|list`), gate mutating GitHub subcommands such as labels/runs/secrets even behind inherited flags, recognize `git` global options before `push`, deny Git remote writes without a concrete target, avoid matching ordinary `service` path/package names as process control, include `crontab` edits, and match real webhook hosts like `hooks.slack.com/services` and Discord `/api/webhooks/`.

## 2026-07-15 — Memory export redaction gates
- For memory export features, keep the public MCP schema, adapter method, governance non-executing allowlist, README docs, standalone registry drift tests, and redaction regression tests in the same PR so exposed tool metadata cannot drift from runtime behavior.
- When testing redaction patterns for token-like values, build dummy secret strings from split literals so repository secret scanners do not flag test fixtures while still exercising the runtime redactor.

## 2026-07-15 — Skill installer path hardening review fixes
- For installer path hardening, guard every public surface that can surface unsafe-path errors, not just install routes; context/read/write routes should return generic unsafe-path messages and tests should assert absolute roots/targets are not leaked.
- If an installer snapshots a root realpath at construction, handle missing-root recovery explicitly: revalidate the missing root's parent before `mkdir`, reject symlinked/repointed parents, then recheck the recreated root before creating child directories.
- When Codex reaches the configured review-invocation cap with new findings, fix/reply/resolve and stop for explicit approval before triggering another review; do not merge on stale clean signals after the head changed.

## 2026-07-15 — Memory TTL policy
- For temporary operational facts, keep TTL metadata on working-memory values (`expiresAt`) and enforce expiration on all read/list/hydration paths; also filter expired runtime rows before flush so stale operational state cannot be re-persisted.
- Memory-review conflict checks can read persisted rows even when runtime hydration is disabled; parse/delete expired persisted TTL rows before returning `present`, otherwise stale temporary facts block normal approval as false conflicts.
- For memory-review conflict resolvers, gate normal approval as well as optional preflight APIs; conflict checks must distinguish dirty runtime changes, pending local deletes, unhydrated persisted values, stale provenance, and concurrent DB updates before allowing replacement.
- If a memory-review resolver adds a new decision action, update the MCP governance allowlist, audit sanitizer, tool registry, adapter surface, and a read-only conflict-inspection tool together; otherwise default governed MCP users can be told to resolve a conflict but blocked from doing it or forced to choose blindly. Add public `fbeast_governor_check` coverage for both direct tool names and `execute_tool` proxy contexts so the shared governor path cannot drift from the registry enum.
- When conflict checks refresh clean in-memory keys from SQLite, also update or clear the runtime cache for that key so a later flush cannot write stale runtime state back over the same persisted value that was just reported as authoritative.
- When verifying workspace package typechecks in a fresh worktree, build dependency packages (or run root `npm run build`) before package-local `tsc --noEmit`; otherwise unresolved workspace package declarations can look like feature regressions.

## 2026-07-15 — Beast process cleanup review fixes
- For Beast worktree cleanup, scope candidates to the orchestrator-owned worktree root and branch prefix, then require a deleted tracked agent or missing agent owner before deletion; default scan APIs should be dry-run and return owner/activity/card/PR evidence for review. Even with explicit destructive cleanup, skip dirty, locked, or active-run worktrees rather than forcing data loss or aborting startup.
- For Beast cleanup paths, treat persisted process-group ownership as verified only when the stored start-time token matches the current `/proc` start time; missing or unreadable start times should fail closed to direct-PID signaling to avoid killing a PID-reused process group.
- Keep cleanup ownership delegated through execution-mode wrappers: container executors must forward `cleanupPendingRun()` so queued container runs can be cancelled before an attempt exists.
- CLI signal cleanup should register and unregister all handled signals symmetrically, and long-running `restart` commands should track the target run before awaiting restart so SIGINT/SIGHUP can clean up in-flight work.
- After a dispatch `onRunCreated` callback, re-read persisted run state before startNow execution; signal cleanup can mark a just-created run stopped before any attempt exists.
- Keep post-spawn metadata providers inside the same cleanup try/catch as attempt persistence so provider failures cannot leave a spawned process without an attempt record.

## 2026-07-15 — Local dashboard CSRF/clickjacking hardening
- Local UI CSRF gates must account for every dashboard serving path: Hono API, built static dashboard, Vite dev server, static proxy, and chat-server-to-daemon compatibility proxy. Pair frame denial headers with both API and HTML/static responses.
- When comparing Origin for browser mutations, check explicit `allowedOrigins` before rejecting on `Sec-Fetch-Site`, and trust implicit same-origin only for loopback hosts (`localhost`, `127.0.0.1`, `[::1]`) to avoid DNS-rebinding Host equality bypasses.
- Multi-hop dashboard proxies should preserve existing `x-forwarded-host`/`x-forwarded-proto` rather than overwriting them at inner hops; otherwise daemon-side same-origin checks see the wrong origin and break valid dashboard Beast mutations.

## 2026-07-15 — Graceful shutdown drain gates
- For daemon drain modes, make one outer mutation-admission middleware own both the draining check and in-flight counter; nested route-specific re-checks can reject already-admitted requests after shutdown begins.
- If shutdown times out waiting for in-flight mutations, do not release ownership markers such as pid files until mutations are quiesced or definitively aborted; otherwise a replacement daemon can start while the old handler still mutates shared state.
- On drain timeout, close HTTP intake but keep shutdown ownership, wait for already-admitted mutating routes to finish, then stop live child runs, dispose services, release the PID file, and report the timeout; otherwise the CLI can exit while a just-created run is orphaned.
- Treat draining sibling daemons as fail-fast for chat-server startup rather than proxying to a 503 daemon or starting route-less/local Beast control that will not recover without restart.

## 2026-07-15 — Cron wrapper Codex closeout
- Cron script wrappers that emit structured failure envelopes need regression coverage for quoted/escaped secret values in both stderr and argv snippets, full Authorization schemes, descendant cleanup after parent termination, and long stderr-drain timers; old inline comments can be superseded only after pushing, resolving the exact Codex threads, and obtaining a fresh current-head review.

## 2026-07-15 — Issue-runner dependency circuit breaker verification
- For availability/refill features that add dependency-specific throttles, model the dependency name in structured signals and configure named breakers so unrelated degraded dependencies do not create a global outage. Regression tests should cover the intended open condition plus an unrelated dependency and a retry/open-until edge case.
- After `npm ci` in a fresh worktree, package-local orchestrator typecheck may fail until dependent workspaces have been built; run `npm run build` (or build the needed workspace packages) before re-running package-local `tsc --noEmit`.

## 2026-07-14 — Type-safety hardening regressions
- For removing unsafe TypeScript double-casts, pair the runtime regression with a source-inspection guard that names the exact bypass (`as unknown as ...`) and the intended type-coupling construct (`satisfies z.ZodType<...>` or typed null-object helpers) so future changes cannot silently reintroduce the cast while preserving behavior.
- Disabled/null-object implementations should return structurally complete domain objects rather than partial objects cast through `unknown`; include required lifecycle/status/time fields in the helper so `tsc --noEmit` enforces drift against upstream type changes.

## 2026-07-14 — Right-to-forget privacy/code-review hardening
- For deletion/right-to-forget flows, compare selectors against both persisted storage rows and the current in-memory overlay; avoid broad stale-instance flushes that can delete unrelated external rows, and keep persisted/runtime deletion finalization rollback-safe.
- Redact destructive privacy selectors before every audit/governance sink, including proxy/envelope validation failures and governor logs; if a tool is destructive, route it through the same governance path as sibling deletion tools rather than exempting it as non-executing data.
- Deletion guards should cover source-scope key segments and replay/hydrate should install guards before restoring user data, while allowing the tool’s own right-to-forget audit event to round-trip without blocking hydration.
- After Codex review on right-to-forget flows, regression-test every reinsertion path it names: stale multi-instance flush, learning-event writes, key-only query matches, episodic step text, substring query semantics, terminal source-scope key segments, checkpoint deletion/guards, and forged audit-event hydration.
- For memory review/consent queues, right-to-forget must also guard candidate edits, reviewer/note metadata, and raw nested candidate values; redaction must scrub review `memory_key` fields and count review rows in public derived-deletion totals.
- When hydrating snapshots over an existing memory DB, clear stale review candidates/provenance/suppressions before restoring working rows so old never-store suppressions cannot block snapshot data.
- If persistence skips writes based on an in-memory cache, re-read the current DB row first; another process may have overwritten the persisted value while this instance's cache still looks unchanged.

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

## 2026-07-16 — Codex usage-limit handling in init Codex hooks fixes
- When Codex responds with usage-limit comments after `@codex review`, treat it as a hard stop for that review round and do not keep triggering repeated reviews.
- For `writeCodexHooks` recovery work, prefer recover+backup flows on malformed existing JSON so user hooks are not silently dropped, and add tests that explicitly assert backup creation and hook-preserving write paths.
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
- 2026-07-15 — Security scanner ReDoS: for untrusted source/env scanners, size bounds must run before allocation/decoding where possible (`stat` before `readFile`), and regex-based string literal extraction should be replaced with a linear parser for adversarial escape/unterminated literal cases. Codex may reproduce small payload DoS with only tens of backslashes, so add a targeted regression for that exact input class.
- 2026-07-15 — Codex-cap cleanup rounds: when Codex findings arrive at the review-trigger cap, fix/reply/resolve every actionable thread and verify CI/unresolved-thread state, but do not fire an over-cap `@codex review` without explicit human approval; block with the exact refused trigger command and latest passing commit so the next worker can resume cleanly.
- 2026-07-16 — Approval-anomaly closeout: if `/v1/approval/pending` exposes anomaly ACK tokens, treat it as operator-sensitive and require governor auth; preserve anomaly notices across waiter refreshes, quote trusted notice text line-by-line, and suppress reusable session tokens for acknowledged anomaly overrides.

- 2026-07-15 — Webhook egress allowlists: match exact public HTTPS targets, reject credentials/query/fragment/path traversal, mirror private-host aliases from the orchestrator egress policy, resolve DNS before every network attempt including retries, and add regression tests for DNS rebinding-style private answers.
- 2026-07-15 — MCP memory scoping: avoid encoding agent scope solely in user-visible keys or summaries. Store explicit scope metadata, use reversible internal key encoding for physical storage, keep logical keys in query/frontload output, and fetch/filter uncapped episodic rows before applying visible result limits so other agents' rows cannot starve the requested scope.
- 2026-07-15 — DR backup review hardening: encrypted state backups should back up only the requested state tree plus explicit sibling DBs, never keys/cache/old artifacts; reject live SQLite sidecars (`-wal`, `-shm`, `-journal`), validate dry-run restore targets, and quarantine approval ledgers rather than reactivating stale approvals.

## 2026-07-16 — Maintenance-mode tracked-agent cleanup
- When maintenance blocks Beast dispatch after a tracked agent has been created, mark the agent `stopped` and append an `agent.dispatch.paused` event in every dispatch path, including chat-backed `AgentInitService.dispatchAgent`.
- HTTP maintenance cleanup for stale `trackedAgentId` values must never mask the intended 423 response; ignore missing-agent cleanup failures but rethrow unexpected cleanup errors.
- Do not keep daemon chat Beast context after a 423 maintenance response from final dispatch; clear it so a later arbitrary chat message cannot auto-resume a completed interview after maintenance is disabled.
- Only stop maintenance-blocked tracked agents that are still `initializing`; direct run requests can name unrelated running/deleted agents, and maintenance errors happen before createRun validates/links that ID.

## 2026-07-16 — LlmCacheStore read-path schema validation
- For JSON cache stores, validate both schemaVersion and the runtime shape (`content` type) before returning entries, otherwise stale/malformed files can be reused as cache hits.
- Add regression tests that write an explicitly mismatched schema version and a wrong-shaped payload to prove stale cache entries are rejected.
- Keep Codex review follow-ups separate from CI: CI green + no fresh Codex findings is not sufficient when Codex usage-limited responses occur; treat limits as blocked merge gates and retry only after credits reset.

## 2026-07-16 — DR process cleanup closeout
- DR process cleanup planners should ignore terminal attempts before PID counting and orphan scans, treat missing-PID live attempts as possible owners of matching processes, and include process-start tokens on executable orphan actions so signal-time consumers can revalidate PID identity before termination.

## 2026-07-16 — Orchestrator focused test command
- In the root workspace, `npm test -- --run ...` passes `--run` to Turbo and fails. For one orchestrator test file, run `npm run test --workspace @franken/orchestrator -- tests/unit/path.test.ts`; run `npm run build` first if package-local typecheck cannot resolve internal `@franken/*` workspace declarations.

## 2026-07-16 — DR point-in-time export review fixes
- Incident exports must summarize the real `.fbeast/beast.db` and `kanban.db` SQLite tables, include chat `pendingApproval` session state as approval evidence, stream/hash large logs instead of buffering them, and apply the same redaction to the serialized artifact that the terminal preview uses.

## 2026-07-17 — Orchestrator chaos-test closeout
- For orchestrator chaos/stability regressions, keep dropped-provider and thrown-tool cases deterministic: use fake timers around never-settling promises, assert cleanup with zero leaked timers, and build dependent workspaces before package typecheck when source-only workspace packages make bare orchestrator `tsc --noEmit` report missing `@franken/*` declarations.

## 2026-07-18 — Spawn-failure telemetry redaction
- Sanitizing the primary failure event is insufficient when the original exception is rethrown: audit every caller that can wrap it into run events, tracked-agent timelines, SSE publications, or durable logs. Rethrow a stable public error, allowlist diagnostic error codes, keep raw command/argv out of durable summaries, and test both immediate dispatch and later run-start paths with secret-bearing failures.

## 2026-07-18 — Durable SSE ticket wiring
- A persistent store implementation is not durable unless every daemon construction path supplies a stable database path; add a restart-level wiring test, and contain best-effort timer cleanup failures so transient SQLite errors cannot escape callbacks and terminate the process.

## 2026-07-18 — Tracked dispatch-failure response redaction
- Treat a failed run response as a bundle: sanitize the run snapshot, stored attempts, historical events, and logs. Event/log redaction must remain effective after dispatch recovery, and restarting a stopped run whose snapshot was cleared must rebuild validated config from the tracked agent before executor start.

## 2026-07-18 — Beast log path containment
- Validate run and attempt identifiers at the `BeastLogStore` filesystem boundary against persisted prefixed-UUID formats, preserve the internal `system` attempt sentinel, and retain a resolved-path containment check as defense in depth. Traversal regressions should exercise both append and read paths while normal-path tests use production-shaped identifiers.

## 2026-07-18 — First-contribution help documentation
- For broad onboarding-documentation issues, close a concrete workflow gap rather than adding another general quickstart. Make the new path discoverable from README, CONTRIBUTING, and the onboarding index, include safe copyable evidence/templates, and add a focused test that locks those entrypoints and redaction guidance together.

## Lessons
- 2026-07-19 — Docs regression tests should assert exact pinned values from manifest and treat setup commands as gate-narrow/full setup distinctions.
- 2026-07-19 — Bounded multi-pass LLM flows need one shared deadline propagated through cache/client/adapter layers, explicit subprocess and retry-wait cancellation, and a caller-side abort race for implementations that ignore signals. Preserve the last useful pre-quality artifact on timeout, use deterministic structural confidence for fast paths, avoid resending unchanged repository context, and test 1/2/4-pass paths plus child-process termination.
- 2026-07-19 — SQLite multi-writer regressions need genuinely independent worker-thread connections, not `Promise.all` around synchronous calls. Acquire write locks with immediate transactions before read-to-write paths, and merge newly persisted working-memory rows for incremental flushes while preserving explicit clear/restore replacement semantics and configured limits.

## 2026-07-19 — Type export renames and deprecation compatibility
- When renaming shared public type names for clarity, keep deprecated aliases temporarily (with `@deprecated` JSDoc) for downstream consumers, update docs/tests to use new names, and add targeted tests validating both canonical and deprecated aliases.
- Before merging such API refactors, require `tsc`, package `lint`, `build`, and focused unit tests for both packages to avoid regressions in public contracts.

## 2026-07-19 — Stable SQLite keyset pagination
- Stable keyset pagination over mutable SQLite data needs both a deterministic tie-breaker (`created_at`, then `id`) and a first-page high-water mark such as `rowid`; the key boundary prevents duplicates while the high-water mark excludes same-timestamp rows inserted between requests.
- Bound secondary metadata work with the page: scope event-history queries to returned IDs, query only active statuses for capacity calculations, and add matching composite indexes so a bounded primary response does not hide unbounded side scans.
- Keep a page-returning client primitive and migrate real UI callers to it explicitly; legacy list helpers must not loop over every page and recreate the original unbounded load.
- Cursor pagination in mutable live views must invalidate in-flight append requests whenever a full refresh replaces the loaded window; capture a window generation before `load more`, discard late responses on generation mismatch, and test the refresh/append race. Use the earliest lifecycle event the backend actually emits as the creation refresh signal rather than relying on a nonexistent synthetic event. Keep SSE snapshots bounded to the same page limit, retain `createdAt`, expose `nextCursor`, and refresh for every unknown row in that bounded first-page snapshot. Compare/sort loaded rows by the full server key `(createdAt DESC, id DESC)` so selected-row pinning preserves pagination semantics; remove misleading array-returning list wrappers rather than silently truncating them.

## 2026-07-20 — Terminal input ownership
- Interactive CLI processes must have one long-lived stdin/readline owner. Inject that owner's question and cancellation functions into approval/governance channels rather than creating a second readline interface; create the owner lazily so startup work cannot consume early keystrokes, and abort expired questions without closing the shared interface. Preserve the existing non-TTY fail-closed path and verify chat-to-approval input routing with a real scripted PTY.

## 2026-07-21 — Quarantine-envelope import hardening
- Treat synthetic quarantine metadata as a strict, exact envelope at trust boundaries: validate the outer and inner key sets plus field, reason, and matching event ID before granting audit exemptions. Report both newly detected malformed rows and already-serialized quarantine envelopes through read audit diagnostics so handoff/import does not erase repair visibility.
