# Context Remaining Question

- [x] Check for a matching progress document and create it if missing.
- [x] Inspect the local Codex CLI/docs for any built-in context-remaining indicator.
- [x] Answer with the supported way to check context remaining, or state clearly if there is no exposed indicator.

## Acceptance Criteria

- The answer is based on the local Codex/CLI surface rather than guesswork.
- If a command or UI exists, it is named directly.
- If no indicator is exposed, that limitation is stated plainly.

## Findings

- The local `codex --help` output exposes no command for “context left”, “token usage”, or remaining window size.
- `codex debug --help` exposes `models`, `app-server`, and `prompt-input`, but still no context-remaining or token-budget meter.
- Practical nearest tool: `codex debug prompt-input` can show the model-visible prompt input, but not how much context remains.
