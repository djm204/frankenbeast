# Chunk 5.7: Context Stuffing Integration

**Phase:** 5 — Skill Loading
**Depends on:** Chunk 5.3 (provider skill translation)
**Estimated size:** Small (part of translator, + tests)

---

## Purpose

When a skill has a `context.md`, append it to the system prompt via the provider's injection mechanism. This is the "layer 2" of the two-layer context model.

## Design

Most marketplace skills work with just MCP tool schemas — the LLM knows how to use GitHub, Slack, etc. from training data. `context.md` is only for team-specific conventions:

- "Always create PRs with conventional commit titles"
- "Use `main` as the base branch, never `master`"
- "Create Linear tickets in project BACKEND-42"

## Implementation

This is part of `ProviderSkillTranslator` (Chunk 5.3). The key addition:

```typescript
// In provider-skill-translator.ts

private buildContextSection(skills: Array<{ name: string; context?: string }>): string[] {
  return skills
    .filter(s => s.context && s.context.trim().length > 0)
    .map(s => `## Skill Context: ${s.name}\n\n${s.context}`);
}
```

Per-provider injection:
- **Claude CLI:** `--append-system-prompt` with concatenated context sections
- **Codex CLI:** Injected via config file or `-c` override as part of system prompt
- **Gemini CLI:** Appended to the `GEMINI.md` managed section
- **API adapters:** Appended to the `systemPrompt` field of `LlmRequest`

## Tests

```typescript
describe('Context stuffing', () => {
  it('Claude: context appears in --append-system-prompt arg', () => {
    const translator = new ProviderSkillTranslator();
    const config = translator.translate({ type: 'claude-cli' } as ILlmProvider, [{
      name: 'github',
      mcpConfig: { mcpServers: { github: { command: 'npx', args: ['@mcp/github'] } } },
      tools: [],
      context: 'Always use conventional commits',
    }]);
    expect(config.systemPromptAddition).toContain(
      expect.stringContaining('Always use conventional commits')
    );
  });

  it('Gemini: context appears in GEMINI.md content', () => { ... });

  it('API: context appears in systemPromptAddition', () => { ... });

  it('skills without context.md produce no additions', () => {
    const config = translator.translate({ type: 'claude-cli' } as ILlmProvider, [{
      name: 'github',
      mcpConfig: { mcpServers: { github: { command: 'npx', args: ['@mcp/github'] } } },
      tools: [],
      // no context
    }]);
    expect(config.systemPromptAddition).toBe('');
  });

  it('multiple skills with context are concatenated', () => {
    const config = translator.translate({ type: 'claude-cli' } as ILlmProvider, [
      { name: 'github', mcpConfig: ..., tools: [], context: 'Use conventional commits' },
      { name: 'linear', mcpConfig: ..., tools: [], context: 'Create in project BACKEND-42' },
    ]);
    expect(config.systemPromptAddition).toContain('Use conventional commits');
    expect(config.systemPromptAddition).toContain('Create in project BACKEND-42');
  });
});
```

## Files

- **Modify:** `packages/franken-orchestrator/src/skills/provider-skill-translator.ts` (from Chunk 5.3)
- **Add tests to:** `packages/franken-orchestrator/tests/unit/skills/provider-skill-translator.test.ts`

## Exit Criteria

- Skills with `context.md` have content appended to system prompt
- Skills without `context.md` produce no system prompt additions
- Each provider uses its native injection mechanism
- Multiple context files are concatenated with skill name headers
