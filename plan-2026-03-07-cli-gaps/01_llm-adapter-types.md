# Chunk 01: CLI LLM Adapter — Types & Tests

## Objective

Create the `CliLlmAdapter` type definitions and failing tests. This adapter implements the `IAdapter` interface from `adapter-llm-client.ts` to enable single-shot LLM completions by spawning `claude --print` or `codex`.

## Files

- **Create**: `franken-orchestrator/src/adapters/cli-llm-adapter.ts`
- **Create**: `franken-orchestrator/test/adapters/cli-llm-adapter.test.ts`
- **Read** (for IAdapter interface): `franken-orchestrator/src/adapters/adapter-llm-client.ts`

## Success Criteria

- [ ] `CliLlmAdapterConfig` interface exported with fields: `provider`, `claudeCmd`, `codexCmd`, `workingDir`, `timeoutMs`
- [ ] `CliLlmAdapter` class skeleton implements `IAdapter` from `adapter-llm-client.ts`
- [ ] All 4 methods stubbed: `transformRequest`, `execute`, `transformResponse`, `validateCapabilities`
- [ ] Test file has tests for:
  - `transformRequest` extracts last user message content as prompt
  - `transformRequest` handles multi-message conversations (takes last user message)
  - `transformResponse` extracts text content from raw CLI output
  - `transformResponse` handles stream-json formatted output (strips JSON framing)
  - `transformResponse` returns empty string for empty output
  - `validateCapabilities` returns true for `'text-completion'`, false for others
- [ ] All tests fail (Red phase of TDD)
- [ ] `npm run typecheck` passes in `franken-orchestrator/`

## Verification Command

```bash
cd franken-orchestrator && npx tsc --noEmit && npx vitest run test/adapters/cli-llm-adapter.test.ts 2>&1 | tail -20
```

## Hardening Requirements

- Import `IAdapter` type from the existing `adapter-llm-client.ts` — do NOT duplicate the interface
- `CliLlmAdapterConfig.timeoutMs` defaults to `120_000`
- `CliLlmAdapterConfig.claudeCmd` defaults to `'claude'`
- `CliLlmAdapterConfig.codexCmd` defaults to `'codex'`
- Do NOT implement the subprocess spawning yet — `execute()` should throw `new Error('Not implemented')` for now
- Export everything from the file (class + config interface)
