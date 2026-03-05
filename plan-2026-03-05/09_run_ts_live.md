# Chunk 09: Live CLI Execution

## Objective

Replace the `process.exit(1)` stub in `franken-orchestrator/src/cli/run.ts` with real `BeastLoop.run()` invocation. After this chunk, `npx frankenbeast --project-id demo --provider anthropic --goal "Explain TDD"` runs the full Beast Loop and prints the result.

## Files

- Modify: `franken-orchestrator/src/cli/run.ts`
- Modify: `franken-orchestrator/src/cli/args.ts` (add `--goal` flag)
- Create: `franken-orchestrator/tests/unit/cli/run.test.ts`

## Context

Current stub in `run.ts` (lines 60-66):
```typescript
console.log(`Starting Beast Loop for project: ${args.projectId}`);
console.log('Provider:', args.provider ?? 'default');
console.log('Model:', args.model ?? 'default');
console.error('Error: Full execution requires module implementations. Use --dry-run for now.');
process.exit(1);
```

`BeastLoop` from `franken-orchestrator/src/beast-loop.ts`:
```typescript
class BeastLoop {
  constructor(deps: BeastLoopDeps, config?: Partial<OrchestratorConfig>)
  async run(input: BeastInput): Promise<BeastResult>
}
```

`BeastInput` from `franken-orchestrator/src/types.ts`:
```typescript
interface BeastInput {
  projectId: string;
  userInput: string;
}
```

`BeastResult` from `franken-orchestrator/src/types.ts`:
```typescript
interface BeastResult {
  sessionId: string;
  projectId: string;
  phase: string;
  status: 'completed' | 'failed' | 'aborted';
  tokenSpend: TokenSpendData;
  planSummary?: string;
  taskResults?: TaskOutcome[];
  error?: Error;
  abortReason?: string;
  durationMs: number;
}
```

`createDeps` from chunk 08 (`./deps-factory.js`):
```typescript
function createDeps(args: CliArgs): BeastLoopDeps
```

## Success Criteria

- [ ] `--goal <text>` CLI flag added to `args.ts` — added as `goal?: string` to `CliArgs`
- [ ] Validation: if `--goal` is not provided and not `--dry-run`/`--resume`, print error and exit
- [ ] `run.ts` imports `createDeps` from `./deps-factory.js`
- [ ] `run.ts` imports `BeastLoop` from `../beast-loop.js`
- [ ] Full execution block: `createDeps(args)` → `new BeastLoop(deps, config)` → `loop.run({ projectId, userInput: args.goal })`
- [ ] Result printed as structured JSON to stdout
- [ ] Human-readable summary line printed: `Beast Loop completed: <status> (<durationMs>ms, <totalTokens> tokens)`
- [ ] Non-zero exit on `status: 'failed'` or `status: 'aborted'`
- [ ] Errors from `createDeps()` caught with helpful message (e.g., "Missing ANTHROPIC_API_KEY")
- [ ] Unit test: mock `createDeps` + `BeastLoop` to verify wiring (no real API calls)
- [ ] TypeScript compiles

## Verification Command

```bash
cd franken-orchestrator && npx vitest run tests/unit/cli/ && npx tsc --noEmit
```

## Hardening Requirements

- Do NOT remove the existing `--dry-run` or `--resume` code paths — they must continue to work
- The `userInput` for `BeastInput` comes from `args.goal`
- Output format: `JSON.stringify(result, null, 2)` to stdout for machine readability
- Error handling: wrap the entire execution in try/catch, print stack trace only in `--verbose` mode
- Keep `process.exit(1)` for fatal errors, but REMOVE the hardcoded "Use --dry-run" message
- The `loadConfig(args)` call is already in place — pass config to `BeastLoop` constructor
- Print task results summary: for each task, print `  [status] taskId: objective`
- If aborted, print `abortReason`
- If failed, print `error.message`
