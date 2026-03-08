# Chunk 05: Wire UX Improvements into session.ts runInterview()

## Objective

Wire `ProgressLlmClient`, `extractDesignSummary`, `formatDesignCard`, and `isNoOpDesign` into the `runInterview()` method of `session.ts`. Replace raw design doc display with summary card. Replace the forced approval gate with a context-aware `[c]ontinue/[r]evise/e[x]it` prompt.

Depends on chunks 01-04.

## Files

- **Modify**: `franken-orchestrator/src/cli/session.ts` (imports + `runInterview()` method)
- **Create**: `franken-orchestrator/tests/unit/cli/session-interview-ux.test.ts`

## Context: Current session.ts

Read `franken-orchestrator/src/cli/session.ts` to understand the current `runInterview()` method and imports. Key things to know:

- `Session` class has a `config` object with `paths`, `io`, `baseBranch`, `provider`, etc.
- `io` implements `InterviewIO` with `ask(prompt)` and `display(text)` methods
- `createCliDeps()` returns `{ deps, logger, finalize, cliLlmAdapter }`
- `AdapterLlmClient` wraps `cliLlmAdapter` into an `ILlmClient`
- `InterviewLoop` is constructed with `(llm, io, graphBuilder?)`
- Design doc is written to disk via a `writeDesignDoc(paths, content)` helper

## Success Criteria

- [ ] `ProgressLlmClient` wraps the `AdapterLlmClient` before passing to `InterviewLoop`
- [ ] After interview generates design doc, `extractDesignSummary` + `formatDesignCard` produce a summary card
- [ ] Summary card is displayed via `io.display()` instead of raw markdown dump
- [ ] `isNoOpDesign` checks the doc; if no-op, prompt header says "no implementation changes needed"
- [ ] Approval gate offers `[c]ontinue`, `[r]evise`, `e[x]it` — NOT a simple approve/deny
- [ ] `[r]evise` asks for feedback, re-generates doc via `progressLlm.complete()`, re-displays card
- [ ] `[x]` returns `'exit'` and `start()` returns `undefined` (does not proceed to plan)
- [ ] `[c]` returns `'continue'` and proceeds normally
- [ ] Unrecognized input re-prompts (no crash)
- [ ] All new tests pass
- [ ] `npx tsc --noEmit` passes in `franken-orchestrator/`

## Verification Command

```bash
cd franken-orchestrator && npx tsc --noEmit && npx vitest run tests/unit/cli/session-interview-ux.test.ts
```

## Implementation Guidance

1. **Add imports** at top of `session.ts`:
```typescript
import { ProgressLlmClient } from '../adapters/progress-llm-client.js';
import { extractDesignSummary, formatDesignCard } from './design-summary.js';
import { isNoOpDesign } from './noop-detector.js';
```

2. **Replace `runInterview()` method** — the new flow:
   - Create `adapterLlm` → wrap with `ProgressLlmClient` → pass to `InterviewLoop`
   - After interview completes, write design doc to disk
   - Call `extractDesignSummary` + `formatDesignCard`, display via `io.display()`
   - Call `isNoOpDesign` to set the prompt header
   - Loop: ask `[c]/[r]/[x]`, handle each choice

3. **Update `start()` method** to handle `runInterview()` returning `'continue' | 'exit'`:
   - If `'exit'`, return `undefined` immediately
   - If `'continue'`, proceed to plan phase as normal

See the plan doc `docs/plans/2026-03-07-interview-ux-plan.md` Task 5 for the full replacement code.

## Hardening Requirements

- Do NOT change `InterviewLoop` itself — only change how it's constructed and what happens after
- The `[r]evise` loop must re-write the design doc to disk (not just display it)
- The `while(true)` approval loop must handle any input (not just c/r/x) — unrecognized input shows help text and re-prompts
- `runInterview()` return type is `Promise<'continue' | 'exit'>` — callers must handle both
- Preserve all existing `runPlan()` and `runExecute()` behavior — only `runInterview()` and `start()` change
- Run existing session tests after changes to confirm nothing else broke
