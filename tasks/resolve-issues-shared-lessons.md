
## 2026-07-06 — Critique scanner edge cases
- Dependency/comment/string scanners that manually skip regex literals must cover keyword-prefixed regexes (including await), postfix-operator division, JSX closing tags, template interpolations, and import trivia comments. Add regression tests for each Codex-reported lexical edge case before re-triggering review.

## 2026-07-08 — Late Codex follow-ups after merge
- After merging a PR that had an asynchronous `@codex review` in flight, audit the merged PR again for post-merge Codex comments/inline findings. If Codex reports current-head findings after merge, open a narrowly scoped follow-up PR against main, run the normal CI + `@codex review` gates on that PR, and merge only after the follow-up is clean.

## 2026-07-08 — Externalized test credential edge cases
- When replacing hard-coded test credentials with configurable helpers, treat blank env values as unset, derive invalid/negative auth tokens from the active configured token so they cannot collide, and avoid test-only env overrides that can turn an invalid value into a valid one.

## 2026-07-08 — CLI provider stream-json edge cases
- When normalizing Claude/Gemini CLI stream-json events, track tool emission separately from text so tool-only successful turns do not fail closed. Preserve provider content order for mixed text/tool blocks, preserve whitespace-only assistant text chunks, and add regressions for terminal frames with no text before retriggering Codex.

## 2026-07-09 — Port scanner Codex closeout
- Port/config scanners should include regression cases for plural port maps, arrays with ignored string elements before numeric values, lower-case compound identifiers (`serverport`/`apiport`), generic comma-bearing type annotations, logical assignment defaults, and quoted top-level keys. For type-only suppression, include long/generated interfaces, tuple labels inside generic arguments, and type aliases split after `=` so false-positive fixes do not hide later runtime configs.
- When Codex reports scanner edge cases that the implementation already handles, add focused regression tests proving service-named identifiers (`supportPort`/`transportPort`/`portalPort`), plural tuple parameter types, nested generic type arguments, and duplicate plural containers before replying/resolving those review threads.
