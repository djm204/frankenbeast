# Chunk 01: Types & Interfaces

## Objective

Add `SkillInput`, `SkillResult`, `IMcpModule`, and extended `SkillDescriptor` / `ISkillsModule` types to `franken-orchestrator/src/deps.ts`. This is the foundation all other chunks depend on.

## Context

- Design doc: `docs/plans/2026-03-05-execute-task-workflow-design.md`
- Target file: `franken-orchestrator/src/deps.ts`
- The orchestrator uses hexagonal architecture — all module ports are minimal interfaces in deps.ts
- `ISkillsModule` currently has `hasSkill()` and `getAvailableSkills()` but no `execute()`
- `SkillDescriptor` currently has `id`, `name`, `requiresHitl` but no `executionType`
- `BeastLoopDeps` currently has 8 module deps + clock but no `mcp`

## Success Criteria

- [ ] `SkillInput` interface added with fields: `objective`, `context` (MemoryContext), `dependencyOutputs` (ReadonlyMap<string, unknown>), `sessionId`, `projectId`
- [ ] `SkillResult` interface added with fields: `output` (unknown), `tokensUsed?` (number)
- [ ] `ISkillsModule` extended with `execute(skillId: string, input: SkillInput): Promise<SkillResult>`
- [ ] `SkillDescriptor` extended with `executionType: 'llm' | 'function' | 'mcp'`
- [ ] `IMcpModule` interface added with `callTool(name, args): Promise<McpToolCallResult>` and `getAvailableTools(): readonly McpToolInfo[]`
- [ ] `McpToolCallResult` interface added with `content` (unknown) and `isError` (boolean)
- [ ] `McpToolInfo` interface added with `name`, `serverId`, `description`
- [ ] `BeastLoopDeps` extended with `readonly mcp?: IMcpModule` (optional)
- [ ] `franken-orchestrator` compiles cleanly with `npx tsc --noEmit`

## Verification Command

```bash
cd franken-orchestrator && npx tsc --noEmit
```

Expected: Exit code 0, no type errors. Compilation errors are expected in test files (stubs don't implement `execute()` yet) — those are fixed in Chunk 02.

If `tsc --noEmit` shows errors ONLY in test helper files (`tests/helpers/stubs.ts`, `tests/helpers/in-memory-ports.ts`), that is acceptable — those are fixed in the next chunk.

## Hardening Requirements

- `SkillInput.context` must use the existing `MemoryContext` type (not a new one)
- `SkillInput.dependencyOutputs` must be `ReadonlyMap` not `Map` (immutability)
- `IMcpModule` must be optional in `BeastLoopDeps` (not all deployments use MCP)
- All new interfaces must use `readonly` properties to match existing conventions in deps.ts
- Do NOT modify any file other than `franken-orchestrator/src/deps.ts`
- Do NOT change existing interface signatures — only extend them (additive changes)
- Export all new types from `deps.ts` (they are consumed by other files)

## Exact Changes

In `franken-orchestrator/src/deps.ts`:

1. After `SkillDescriptor` (line 36), add `executionType` field
2. After `ISkillsModule` (line 30), add `execute` method
3. After the Skills section, add `SkillInput` and `SkillResult` interfaces
4. Before `BeastLoopDeps`, add `IMcpModule`, `McpToolCallResult`, `McpToolInfo` interfaces
5. Add `readonly mcp?: IMcpModule` to `BeastLoopDeps`
