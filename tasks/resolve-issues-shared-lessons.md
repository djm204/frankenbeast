# Resolve Issues Shared Lessons

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

## 2026-07-09 — MCP firewall dynamic config review lessons
- When a proxy/shared adapter needs active project config, pass both explicit `root` and `configPath` through every factory/init path; resolve relative config paths from the project root rather than `cwd`, and add nested-cwd regressions.
- Treat explicit config paths (`--config`/env) as fail-closed: missing explicit security config must throw instead of silently falling back to a default scan tier. Keep only implicit legacy defaults optional.
- User-configured regex filters need positive and negative ReDoS regressions before each Codex round: safe unquantified alternation (`(password|token)`) must still work, while nested quantifiers, quantified alternation, repeated quantified atoms, and bounded nested quantifiers must be rejected before scan evaluation.

## 2026-07-09 — Generic comms gateway hardening
- For generic comms routes, keep authentication before body parsing/size buffering, preserve local-dev by allowing only verified loopback requests when no operator token is configured, and add strict Zod regressions for both auth and malformed payloads. In Zod v3, `z.unknown()` can infer an optional object property; use a required custom schema or explicit post-parse cast when validating required unknown fields such as `rawEvent`.

## 2026-07-09 — Root Vitest CI suite filters
- When promoting `npm run test:root` into CI, keep the default suite deterministic by excluding integration/e2e unless env flags or explicit file paths opt in. Normalize `./`, absolute paths, and `filename:line` filters; skip operands for Vitest options such as `--exclude` and `-t` before classifying path-looking strings; preserve mixed explicit file lists; and compose optional includes so `INTEGRATION`, `E2E`, and Docker-build coverage can be combined without silently skipping a requested suite.
- Keep static Dockerfile checks in the default root suite while gating only the actual Docker build assertion behind `DOCKER_BUILD=true`; excluding the whole Dockerfile test hides useful non-Docker policy coverage from CI.
