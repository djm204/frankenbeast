# Chunk 03: IssueTriage — LLM Complexity Assessment

## Objective

Implement `IssueTriage` that sends all fetched issues to an LLM in a single call and gets back a complexity assessment (one-shot vs chunked) for each issue. Uses `ICliProvider` for LLM access (same pattern as `CliLlmAdapter`).

## Files

- **Create**: `franken-orchestrator/src/issues/issue-triage.ts`
- **Modify**: `franken-orchestrator/src/issues/index.ts` (add export)
- **Test**: `franken-orchestrator/tests/unit/issues/issue-triage.test.ts`

## Success Criteria

- [ ] `IssueTriage` class implements `IIssueTriage`
- [ ] Constructor accepts an LLM completion function `(prompt: string) => Promise<string>` (same as `CliLlmAdapter` pattern)
- [ ] `triage()` builds a prompt listing all issues with number, title, body (truncated to 2000 chars per issue)
- [ ] Prompt instructs LLM to return JSON array: `[{ issueNumber, complexity, rationale, estimatedScope }]`
- [ ] Parses LLM JSON response, validates each entry has required fields
- [ ] Falls back to `'one-shot'` if an individual issue's complexity field is missing or invalid
- [ ] Retries once on parse failure (malformed JSON), then throws
- [ ] Returns `TriageResult[]` sorted by issue number
- [ ] All tests pass with mocked LLM function
- [ ] `npx tsc --noEmit` passes

## Verification Command

```bash
cd franken-orchestrator && npx tsc --noEmit && npx vitest run tests/unit/issues/issue-triage.test.ts
```

## Hardening Requirements

- The triage prompt must include clear classification criteria:
  - **One-shot**: single file or tightly scoped, 1-2 acceptance criteria, straightforward fix
  - **Chunked**: multi-file changes, 3+ acceptance criteria, architectural changes, multiple concerns
- Truncate issue bodies to 2000 chars to avoid prompt overflow with many issues
- JSON extraction: look for `[` ... `]` in LLM output (may include preamble text)
- Do NOT use `eval()` or `new Function()` — use `JSON.parse()` only
- If LLM returns complexity values other than `'one-shot'` or `'chunked'`, default to `'one-shot'`
