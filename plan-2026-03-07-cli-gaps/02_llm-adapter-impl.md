# Chunk 02: CLI LLM Adapter — Implementation

## Objective

Implement the `CliLlmAdapter.execute()` method that spawns `claude --print` (or codex) as a subprocess for single-shot LLM completions. Also implement `transformRequest` and `transformResponse` to make all tests from chunk 01 pass.

## Files

- **Edit**: `franken-orchestrator/src/adapters/cli-llm-adapter.ts`
- **Edit**: `franken-orchestrator/test/adapters/cli-llm-adapter.test.ts` (add execute tests)
- **Read** (for spawn pattern): `franken-orchestrator/src/skills/ralph-loop.ts`

## Success Criteria

- [ ] `transformRequest` extracts the last user message content and returns `{ prompt, maxTurns: 1 }`
- [ ] `execute()` spawns the correct CLI binary based on `config.provider`
- [ ] `execute()` builds args: `['--print', '--dangerously-skip-permissions', '--output-format', 'stream-json', '--verbose', prompt, '--max-turns', '1']`
- [ ] `execute()` clears ALL `CLAUDE*` environment variables from the child process env (freeze bug prevention)
- [ ] `execute()` adds `--plugin-dir /dev/null` and `--no-session-persistence` to args
- [ ] `execute()` respects `config.timeoutMs` — kills child process on timeout
- [ ] `execute()` rejects on non-zero exit code with stderr in error message
- [ ] `transformResponse` parses stream-json output, extracts text blocks using `tryExtractTextFromNode` pattern
- [ ] `transformResponse` handles plain text output (non-JSON) by returning it as-is
- [ ] `validateCapabilities('text-completion')` returns `true`
- [ ] All tests from chunk 01 now pass (Green phase)
- [ ] New integration-style test with mocked `child_process.spawn` verifies full flow: transformRequest -> execute -> transformResponse
- [ ] `npm run typecheck` passes

## Verification Command

```bash
cd franken-orchestrator && npx tsc --noEmit && npx vitest run test/adapters/cli-llm-adapter.test.ts
```

## Hardening Requirements

- **CRITICAL**: Clear ALL env vars starting with `CLAUDE` — use `Object.keys(env).filter(k => k.startsWith('CLAUDE')).forEach(k => delete env[k])`. This prevents the spawned CLI from connecting to VS Code or loading plugins.
- Use `child_process.spawn` not `execSync` — we need streaming and timeout control
- Collect stdout into a buffer, return as string when process exits
- The `tryExtractTextFromNode` logic should handle both `message` and `content_block` in nested keys (per MEMORY.md)
- Do NOT use RalphLoop here — this is a simpler single-shot wrapper. RalphLoop is for multi-iteration conversations with promise detection.
- Constructor should accept an optional `_spawnFn` for test injection (same pattern as RalphLoop)
