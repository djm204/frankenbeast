# Chunk 07: CLI Output — Service Labels

## Objective

Add service attribution to all log output. Every log line gets a colored `[service]` badge so the user can instantly tell which component produced it. Update all call sites in the orchestrator to pass service names.

## Files

- **Edit**: `franken-orchestrator/src/logging/beast-logger.ts`
- **Create**: `franken-orchestrator/test/logging/beast-logger-labels.test.ts`
- **Edit**: `franken-orchestrator/src/cli/session.ts` (add service labels to log calls)
- **Edit**: `franken-orchestrator/src/skills/cli-skill-executor.ts` (add service labels)
- **Edit**: `franken-orchestrator/src/skills/ralph-loop.ts` (add service labels to callbacks)

## Success Criteria

- [ ] `BeastLogger` methods (`info`, `warn`, `error`, `debug`) accept an optional `source?: string` parameter as the last argument
- [ ] When `source` is provided, the log line is prefixed with a colored badge: `[ralph]`, `[git]`, `[observer]`, `[planner]`, `[session]`, `[budget]`, `[config]`
- [ ] Badge color map: ralph=cyan, git=yellow, observer=magenta, planner=blue, session=green, budget=red, config=white
- [ ] When `source` is omitted, no badge is shown (backwards compatible)
- [ ] `debug` level lines only appear when `verbose: true`
- [ ] `info` level lines always appear
- [ ] Test: `logger.info('hello', 'ralph')` output includes `[ralph]` with cyan ANSI codes
- [ ] Test: `logger.debug('detail', 'git')` output is suppressed when `verbose: false`
- [ ] Test: `logger.debug('detail', 'git')` output includes `[git]` when `verbose: true`
- [ ] `session.ts` uses `logger.info('Decomposing...', 'planner')` style calls
- [ ] `cli-skill-executor.ts` uses `'ralph'` and `'git'` labels on its log calls
- [ ] All existing tests pass

## Verification Command

```bash
cd franken-orchestrator && npx tsc --noEmit && npx vitest run test/logging/beast-logger-labels.test.ts && npx vitest run
```

## Hardening Requirements

- Do NOT change the existing `BeastLogger` constructor API — only add the optional `source` param to methods
- Keep `getLogEntries()` returning the full formatted strings (including badges) for file output
- Badge formatting: `\x1b[36m[ralph]\x1b[0m` (example for cyan) — use the ANSI constants already defined in beast-logger.ts
- Maximum badge width: 10 chars (pad shorter names with spaces for alignment)
- Do NOT add service labels to the banner or summary display — only to operational log lines
