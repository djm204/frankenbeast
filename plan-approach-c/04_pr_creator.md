# Chunk 04: PrCreator — PR Creation in Closure Phase

## Objective

Add PR creation capability to the closure phase. After all tasks pass, create a GitHub PR targeting `--base-branch` (default: `main`) using `gh pr create`.

## Files

- **Create**: `franken-orchestrator/src/closure/pr-creator.ts`
- **Create**: `franken-orchestrator/tests/unit/pr-creator.test.ts`
- **Modify**: `franken-orchestrator/src/phases/closure.ts` — call `PrCreator` after traces+heartbeat
- **Modify**: `franken-orchestrator/src/deps.ts` — add optional `prCreator?: PrCreator` to `BeastLoopDeps`
- **Modify**: `franken-orchestrator/src/index.ts` — export `PrCreator`

## Key Reference Files

- `franken-orchestrator/src/phases/closure.ts` — existing `runClosure()` function
- `franken-orchestrator/src/types.ts` — `BeastResult`, `TaskOutcome`
- `franken-orchestrator/src/deps.ts` — `BeastLoopDeps`

## Design

```typescript
interface PrCreatorConfig {
  readonly targetBranch: string;    // default: 'main'
  readonly disabled: boolean;       // --no-pr flag
  readonly remote: string;          // default: 'origin'
}

class PrCreator {
  constructor(
    private readonly config: PrCreatorConfig,
    private readonly exec: (cmd: string) => string = execSync as any,
  ) {}

  async create(result: BeastResult): Promise<{ url: string } | null> {
    // 1. Check if all tasks completed
    // 2. Check if --no-pr (config.disabled)
    // 3. Push current branch to remote
    // 4. Check if PR already exists (gh pr list --head <branch>)
    // 5. Generate title from result (e.g., "feat: <projectId> — N chunks completed")
    // 6. Generate body from TaskOutcome[] (summary table)
    // 7. Run: gh pr create --base <targetBranch> --title "..." --body "..."
    // 8. Return { url } or null if skipped/already exists
  }
}
```

## Success Criteria

- [ ] `PrCreator` class with injectable `exec` function for testing
- [ ] Generates PR title from `BeastResult.projectId`
- [ ] Generates PR body with task summary table (chunk name, status, iterations)
- [ ] Pushes branch to remote before creating PR
- [ ] Skips if `config.disabled` is true (returns null)
- [ ] Skips if not all tasks completed (returns null, logs reason)
- [ ] Skips if PR already exists for this branch (idempotent, returns null)
- [ ] `runClosure()` calls `prCreator.create()` when available
- [ ] Optional in `BeastLoopDeps` — existing tests unaffected
- [ ] Tests mock `exec` to verify correct `gh` commands without actually running them
- [ ] All tests pass: `cd franken-orchestrator && npx vitest run tests/unit/pr-creator.test.ts`
- [ ] `npx tsc --noEmit` passes

## Verification Command

```bash
cd franken-orchestrator && npx vitest run tests/unit/pr-creator.test.ts && npx tsc --noEmit
```

## Hardening Requirements

- `exec` dependency injection allows full testing without `gh` CLI installed
- PR body should use markdown: summary bullets + task table
- Handle `gh` not installed gracefully (log warning, return null, don't crash)
- Handle push failures gracefully (log error, return null)
- PR title should be under 70 characters
- Do NOT require `gh` at import time — only at `create()` call time
- `prCreator` is optional in `BeastLoopDeps` — closure must work without it
- Use `.js` extensions in all import paths (NodeNext)
