# Chunk 01: Types & Interfaces

## Objective

Add `SkillInput`, `SkillResult`, `IMcpModule`, extend `SkillDescriptor` and `ISkillsModule` in `franken-orchestrator/src/deps.ts`. Foundation for all other chunks.

## Files

- Modify: `franken-orchestrator/src/deps.ts`

## Success Criteria

- [ ] `SkillInput` interface: `objective` (string), `context` (MemoryContext), `dependencyOutputs` (ReadonlyMap<string, unknown>), `sessionId` (string), `projectId` (string)
- [ ] `SkillResult` interface: `output` (unknown), `tokensUsed?` (number)
- [ ] `ISkillsModule.execute(skillId: string, input: SkillInput): Promise<SkillResult>` added
- [ ] `SkillDescriptor.executionType: 'llm' | 'function' | 'mcp'` added
- [ ] `IMcpModule` interface: `callTool(name, args): Promise<McpToolCallResult>`, `getAvailableTools(): readonly McpToolInfo[]`
- [ ] `McpToolCallResult`: `content` (unknown), `isError` (boolean)
- [ ] `McpToolInfo`: `name`, `serverId`, `description`
- [ ] `BeastLoopDeps` extended with `readonly mcp?: IMcpModule`
- [ ] TypeScript compiles (test files may error — that's expected, fixed in chunk 02)

## Verification Command

```bash
cd franken-orchestrator && npx tsc --noEmit 2>&1 | grep -v "tests/" || true
```

## Hardening Requirements

- Use `readonly` on all new interface properties (match existing convention)
- `SkillInput.context` must reuse existing `MemoryContext` type
- `SkillInput.dependencyOutputs` must be `ReadonlyMap` not `Map`
- `IMcpModule` must be optional (`mcp?`) in `BeastLoopDeps`
- Only modify `franken-orchestrator/src/deps.ts` — nothing else
- All changes are additive — do not alter existing interface signatures
