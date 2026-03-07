# Chunk 08: CLI Output — Clean JSON & Iteration Progress

## Objective

Fix RalphLoop's terminal output so no garbled JSON appears. Buffer partial stream-json frames, only emit clean text to stdout. Add clean iteration progress display with chunk name, iteration count, and duration.

## Files

- **Edit**: `franken-orchestrator/src/skills/ralph-loop.ts`
- **Create**: `franken-orchestrator/test/skills/ralph-loop-output.test.ts`
- **Edit**: `franken-orchestrator/src/skills/cli-skill-executor.ts` (progress display)
- **Read**: `franken-orchestrator/src/logging/beast-logger.ts`

## Success Criteria

- [ ] RalphLoop's stdout processing buffers incoming data line-by-line
- [ ] Each complete line is checked: if it's valid JSON, extract text content; if plain text, pass through
- [ ] JSON frames from `stream-json` format are parsed and only the `text` content is extracted
- [ ] Partial JSON lines are buffered until complete (newline-terminated)
- [ ] No raw `{"type":"content_block_delta",...}` JSON appears in terminal output
- [ ] Clean text output is emitted to the `onIteration` callback's `stdout` field
- [ ] `CliSkillExecutor` displays iteration progress line: `[ralph] Iteration 3/30 | chunk: 04_observer | 45s elapsed | ~1,200 tokens`
- [ ] Progress line uses carriage return (`\r`) to overwrite in-place (no scrolling spam)
- [ ] On iteration completion, a final summary line is printed (not overwritten)
- [ ] Test: feed garbled stream-json input, verify only clean text comes out
- [ ] Test: feed partial JSON line split across two data events, verify correct buffering
- [ ] Test: feed plain text input, verify it passes through unchanged
- [ ] All existing ralph-loop tests pass

## Verification Command

```bash
cd franken-orchestrator && npx tsc --noEmit && npx vitest run test/skills/ralph-loop-output.test.ts && npx vitest run test/skills/
```

## Hardening Requirements

- `tryExtractTextFromNode` must check for `message` and `content_block` in nested keys (not direct keys) — per MEMORY.md stream output parsing fix
- Buffer strategy: accumulate bytes until `\n`, then process each complete line
- If a line fails JSON.parse, treat it as plain text (don't throw)
- Keep the existing `onIteration` callback contract — the `stdout` field should contain clean text only
- The progress display should use the `BeastLogger` with `'ralph'` service label
- Do NOT change the `--output-format stream-json` flag — we still want structured output for parsing, just clean display
- Carriage return progress only works on TTY — check `process.stdout.isTTY` and fall back to newline-separated if not
