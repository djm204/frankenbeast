
## 2026-07-06 — Critique scanner edge cases
- Dependency/comment/string scanners that manually skip regex literals must cover keyword-prefixed regexes (including await), postfix-operator division, JSX closing tags, template interpolations, and import trivia comments. Add regression tests for each Codex-reported lexical edge case before re-triggering review.

## 2026-07-08 — Late Codex follow-ups after merge
- After merging a PR that had an asynchronous `@codex review` in flight, audit the merged PR again for post-merge Codex comments/inline findings. If Codex reports current-head findings after merge, open a narrowly scoped follow-up PR against main, run the normal CI + `@codex review` gates on that PR, and merge only after the follow-up is clean.
