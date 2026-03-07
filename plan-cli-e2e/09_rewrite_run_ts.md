# Chunk 09: Rewrite run.ts

## Objective

Rewrite `run.ts` as a thin entry point. It parses args, detects mode (subcommand vs default), resolves project root and base branch, creates stdin-based `InterviewIO`, instantiates `Session`, and calls `session.start()`.

## Files

- **Modify**: `franken-orchestrator/src/cli/run.ts` — full rewrite
- **Modify**: `franken-orchestrator/tests/unit/cli/` — update any imports if needed

## Key Reference Files

- `franken-orchestrator/src/cli/args.ts` — `parseArgs`, `CliArgs`, `printUsage` (chunk 01)
- `franken-orchestrator/src/cli/project-root.ts` — `resolveProjectRoot`, `getProjectPaths`, `scaffoldFrankenbeast` (chunk 02)
- `franken-orchestrator/src/cli/base-branch.ts` — `resolveBaseBranch` (chunk 03)
- `franken-orchestrator/src/cli/session.ts` — `Session`, `SessionPhase` (chunk 08)
- `franken-orchestrator/src/logging/beast-logger.ts` — `BANNER`
- `plan-approach-c/build-runner.ts` — existing entry point to reference
- `docs/plans/2026-03-06-cli-e2e-design.md` — CLI surface spec

## Implementation

```typescript
#!/usr/bin/env node

import { createInterface } from 'node:readline';
import { parseArgs, printUsage } from './args.js';
import { resolveProjectRoot, getProjectPaths, scaffoldFrankenbeast } from './project-root.js';
import { resolveBaseBranch } from './base-branch.js';
import { Session } from './session.js';
import type { SessionPhase } from './session.js';
import type { InterviewIO } from '../planning/interview-loop.js';
import { BANNER } from '../logging/beast-logger.js';

/**
 * Creates an InterviewIO backed by stdin/stdout.
 */
function createStdinIO(): InterviewIO {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return {
    ask: (question: string) =>
      new Promise<string>((resolve) => rl.question(`${question}\n> `, resolve)),
    display: (message: string) => console.log(message),
  };
}

/**
 * Determines entry phase and exit behavior from CLI args.
 */
function resolvePhases(args: ReturnType<typeof parseArgs>): {
  entryPhase: SessionPhase;
  exitAfter?: SessionPhase;
} {
  // Subcommand mode
  if (args.subcommand === 'interview') {
    return { entryPhase: 'interview', exitAfter: 'interview' };
  }
  if (args.subcommand === 'plan') {
    return { entryPhase: 'plan', exitAfter: 'plan' };
  }
  if (args.subcommand === 'run') {
    return { entryPhase: 'execute' };
  }

  // Default mode — detect entry from provided files
  if (args.planDir) {
    return { entryPhase: 'execute' };
  }
  if (args.designDoc) {
    return { entryPhase: 'plan' };
  }

  // No files, no subcommand — full interactive flow
  return { entryPhase: 'interview' };
}

async function main(): Promise<void> {
  const args = parseArgs();

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  console.log(BANNER);

  // Resolve project root
  const root = resolveProjectRoot(args.baseDir);
  const paths = getProjectPaths(root);
  scaffoldFrankenbeast(paths);

  // Create IO for interactive prompts
  const io = createStdinIO();

  // Resolve base branch
  const baseBranch = await resolveBaseBranch(root, args.baseBranch, io);

  // Determine phases
  const { entryPhase, exitAfter } = resolvePhases(args);

  // Create and run session
  const session = new Session({
    paths,
    baseBranch,
    budget: args.budget,
    provider: args.provider,
    noPr: args.noPr,
    verbose: args.verbose,
    reset: args.reset,
    io,
    entryPhase,
    exitAfter,
    designDocPath: args.designDoc,
    planDirOverride: args.planDir,
  });

  const result = await session.start();

  if (result && result.status !== 'completed') {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal:', error instanceof Error ? error.message : error);
  process.exit(1);
});
```

## Success Criteria

- [ ] `run.ts` is a thin entry point — no business logic
- [ ] Parses args, resolves project root, scaffolds `.frankenbeast/`
- [ ] Creates stdin-based `InterviewIO`
- [ ] Resolves base branch with confirmation prompt
- [ ] Detects entry phase from subcommand or provided files
- [ ] Creates `Session` and calls `start()`
- [ ] Exits with code 1 on failure, 0 on success
- [ ] Displays BANNER on startup
- [ ] `npx tsc --noEmit` passes
- [ ] Existing tests still pass: `cd franken-orchestrator && npx vitest run`

## Verification Command

```bash
cd franken-orchestrator && npx tsc --noEmit && npx vitest run
```

## Hardening Requirements

- `createStdinIO` creates readline interface — must NOT be created if `--help` is passed (process exits before)
- `resolvePhases` logic: subcommand takes precedence, then flags, then default
- Do NOT call `process.exit(0)` on success — let the process end naturally (except for `--help`)
- `main().catch()` handles fatal errors with clean error message
- Use `.js` extensions in all import paths
- The shebang `#!/usr/bin/env node` must be on line 1
