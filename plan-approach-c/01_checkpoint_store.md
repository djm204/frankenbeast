# Chunk 01: ICheckpointStore Interface + FileCheckpointStore

## Objective

Create the checkpoint persistence system with per-commit granularity. This is the foundation for crash recovery across all input modes.

## Files

- **Create**: `franken-orchestrator/src/checkpoint/file-checkpoint-store.ts`
- **Modify**: `franken-orchestrator/src/deps.ts` — add `ICheckpointStore` interface and optional `checkpoint?: ICheckpointStore` to `BeastLoopDeps`
- **Modify**: `franken-orchestrator/src/index.ts` — export `FileCheckpointStore` and `ICheckpointStore`
- **Create**: `franken-orchestrator/tests/unit/file-checkpoint-store.test.ts`

## Key Reference Files

- `franken-orchestrator/src/deps.ts` — existing `BeastLoopDeps` interface
- `franken-orchestrator/src/index.ts` — existing exports
- `plan-beast-runner/build-runner.ts` lines 300-319 — existing checkpoint logic to draw from

## Interface

```typescript
interface ICheckpointStore {
  has(key: string): boolean;
  write(key: string): void;
  readAll(): Set<string>;
  clear(): void;
  recordCommit(taskId: string, stage: string, iteration: number, commitHash: string): void;
  lastCommit(taskId: string, stage: string): string | undefined;
}
```

## Success Criteria

- [ ] `ICheckpointStore` interface defined in `deps.ts`
- [ ] `BeastLoopDeps` extended with optional `checkpoint?: ICheckpointStore`
- [ ] `FileCheckpointStore` implements `ICheckpointStore` with append-only file storage
- [ ] `has()` returns true for written keys
- [ ] `write()` appends key to file (one per line)
- [ ] `readAll()` returns `Set<string>` of all entries, tolerates partial/empty lines
- [ ] `clear()` truncates the file
- [ ] `recordCommit()` writes `{taskId}:{stage}:iter_{iteration}:commit_{hash}` format
- [ ] `lastCommit()` returns most recent commit hash for a given taskId+stage, or undefined
- [ ] All tests pass: `cd franken-orchestrator && npx vitest run tests/unit/file-checkpoint-store.test.ts`
- [ ] `npx tsc --noEmit` passes

## Verification Command

```bash
cd franken-orchestrator && npx vitest run tests/unit/file-checkpoint-store.test.ts && npx tsc --noEmit
```

## Hardening Requirements

- File I/O must handle missing file gracefully (create on first write)
- `readAll()` must tolerate trailing newlines, empty lines, partial writes
- Use `node:fs` sync operations (appendFileSync, readFileSync) — no async needed
- `checkpoint` is optional in `BeastLoopDeps` — existing tests must not break
- Do NOT modify any existing phase files in this chunk
- Export as `export { FileCheckpointStore }` (class) and `export type { ICheckpointStore }` (type)
- Use `.js` extensions in all import paths (NodeNext)
