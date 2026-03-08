# Interview Loop UX Improvements

**Date**: 2026-03-07
**Status**: Approved

## Problem

The `frankenbeast interview` flow has three UX issues:

1. **Dead air** — LLM calls in `InterviewLoop` block with no progress feedback (10-30s of silence)
2. **Output spam** — the full raw design doc is dumped to the terminal after generation
3. **Forced approval gate** — always asks "Approve this design?" even when the conclusion is "nothing to do"

## Approach: ProgressLlmClient Decorator (Approach 2)

Wrap `ILlmClient` with a transparent decorator that handles progress UX. The interview loop and planning code don't change their LLM usage — the wrapper handles spinner, streaming, and token reporting.

## Components

### 1. ProgressLlmClient

A decorator around `ILlmClient` that adds UX feedback to every `complete()` call.

**Flow:**
1. Start spinner with label (default: "Thinking...")
2. Delegate to `inner.complete(prompt)`
3. Stop spinner, print completion stats: `Done (12.3s, ~2.4k tokens)`
4. Return the result

**Constructor options:**
- `label?: string` — spinner label (default: "Thinking...")
- `silent?: boolean` — suppress terminal output for tests

**Location:** `src/adapters/progress-llm-client.ts`

### 2. CLI Spinner

A simple animated spinner utility for the terminal.

- Renders on stderr (doesn't interfere with stdout piping)
- Shows elapsed time: `Thinking... (3.2s)`
- Animated frames: `[|, /, -, \]` cycling at ~100ms
- `start(label)` / `stop(finalMessage)` API
- Cleans up its line on stop (cursor reset)

**Location:** `src/cli/spinner.ts`

### 3. Summary-only design doc display

After the interview loop generates the design doc, `session.ts`'s `runInterview()`:

1. Writes the full doc to `.frankenbeast/plans/design.md` (already happens)
2. Extracts a summary from the markdown:
   - Title: first `# ` heading
   - Section count: number of `## ` headings
   - Summary blurb: first non-heading paragraph, truncated to ~200 chars
3. Displays a compact card instead of the raw doc:

```
-- Design Document --------------------------
  Title:    Observer Module Completeness
  Sections: 4
  Saved to: .frankenbeast/plans/design.md

  Summary: The observer module is fully
  implemented with all required...
---------------------------------------------
```

**Location:** summary extraction in `src/cli/design-summary.ts`, display in `session.ts`

### 4. Context-aware approval gate

Replace the hardcoded "Approve this design? (yes/no)" in `session.ts`'s `runInterview()`.

**No-op detection** — scan the design doc for signals that no implementation is needed:
- Keywords: "code complete", "no changes required", "fully implemented", "nothing to do", "no work needed"
- No `## Implementation` / `## Tasks` / `## Changes` sections
- Very short doc (< 200 chars of content)

**If no-op detected:**
```
Analysis complete: no implementation changes needed.

  [c] Continue to planning phase anyway
  [r] Revise -- give feedback to regenerate
  [x] Exit

>
```

**If real work detected:**
```
Design ready. What next?

  [c] Continue to planning phase
  [r] Revise -- give feedback to regenerate
  [x] Exit

>
```

On `[r]`, prompt for feedback text, pass to LLM for revision, regenerate summary card, and re-prompt.

On `[x]`, return `undefined` from `runInterview()` and exit the session.

**Location:** `session.ts`'s `runInterview()` method. The `InterviewLoop` class stays unchanged — it handles gathering answers and generating the doc. The session layer owns phase-transition decisions.

## Wiring

In `session.ts`'s `runInterview()`:
- Wrap `AdapterLlmClient` with `ProgressLlmClient` before passing to `InterviewLoop`
- After interview loop completes, use `extractDesignSummary()` for display
- Replace `reviewLoop()` call with the new context-aware approval gate

In `session.ts`'s `runPlan()`:
- Also wrap with `ProgressLlmClient` (label: "Decomposing design...") for the planning LLM call

## Files to create

| File | Purpose |
|------|---------|
| `src/cli/spinner.ts` | Animated terminal spinner |
| `src/adapters/progress-llm-client.ts` | ILlmClient decorator with spinner + stats |
| `src/cli/design-summary.ts` | Extract title/sections/summary from markdown |

## Files to modify

| File | Change |
|------|--------|
| `src/cli/session.ts` | Wire ProgressLlmClient, summary display, context-aware gate |

## Files unchanged

| File | Why |
|------|-----|
| `src/planning/interview-loop.ts` | No changes — decorator is transparent |
| `src/adapters/cli-llm-adapter.ts` | No changes — streaming is future work |
| `src/adapters/adapter-llm-client.ts` | No changes — wrapped by decorator |
| `src/cli/review-loop.ts` | No changes — replaced by inline gate in session.ts for interview phase |
