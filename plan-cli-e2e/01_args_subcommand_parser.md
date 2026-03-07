# Chunk 01: Args & Subcommand Parser

## Objective

Rewrite `args.ts` to support subcommands (`interview`, `plan`, `run`) and new global flags. The existing `--project-id`, `--config`, `--model`, `--dry-run` flags are removed — they belonged to the stub CLI. The new CLI has a different surface.

## Files

- **Modify**: `franken-orchestrator/src/cli/args.ts` — full rewrite
- **Modify**: `franken-orchestrator/tests/unit/cli/args.test.ts` — full rewrite
- **Modify**: `franken-orchestrator/src/index.ts` — export new `CliArgs` type

## Key Reference Files

- `franken-orchestrator/src/cli/args.ts` — current stub args (lines 1-58)
- `franken-orchestrator/tests/unit/cli/args.test.ts` — current tests
- `docs/plans/2026-03-06-cli-e2e-design.md` — CLI surface spec

## Interface

```typescript
export type Subcommand = 'interview' | 'plan' | 'run' | undefined;

export interface CliArgs {
  subcommand: Subcommand;
  baseDir: string;            // --base-dir (default: process.cwd())
  baseBranch?: string;        // --base-branch (optional override)
  budget: number;             // --budget (default: 10)
  provider: 'claude' | 'codex'; // --provider (default: 'claude')
  designDoc?: string;         // --design-doc <path>
  planDir?: string;           // --plan-dir <path>
  noPr: boolean;              // --no-pr (default: false)
  verbose: boolean;           // --verbose (default: false)
  reset: boolean;             // --reset (default: false)
  resume: boolean;            // --resume (default: false)
  config?: string;            // --config <path>
  help: boolean;              // --help (default: false)
}
```

## Implementation

```typescript
import { parseArgs as nodeParseArgs } from 'node:util';

export type Subcommand = 'interview' | 'plan' | 'run' | undefined;

export interface CliArgs {
  subcommand: Subcommand;
  baseDir: string;
  baseBranch?: string | undefined;
  budget: number;
  provider: 'claude' | 'codex';
  designDoc?: string | undefined;
  planDir?: string | undefined;
  noPr: boolean;
  verbose: boolean;
  reset: boolean;
  resume: boolean;
  config?: string | undefined;
  help: boolean;
}

const VALID_SUBCOMMANDS = new Set(['interview', 'plan', 'run']);

const USAGE = `
Usage: frankenbeast [subcommand] [options]

Subcommands:
  interview               Gather requirements interactively, generate design doc
  plan --design-doc <f>   Decompose design doc into chunk files
  run                     Execute chunk files (from .frankenbeast/ or --plan-dir)

Options:
  --base-dir <path>       Project root (default: cwd)
  --base-branch <name>    Git base branch (default: main)
  --budget <usd>          Budget limit in USD (default: 10)
  --provider <name>       claude | codex (default: claude)
  --design-doc <path>     Path to design document
  --plan-dir <path>       Path to chunk files directory
  --config <path>         Path to config file (JSON)
  --no-pr                 Skip PR creation
  --verbose               Debug logs + trace viewer
  --reset                 Clear checkpoint and traces
  --resume                Resume from checkpoint
  --help                  Show this help message

Examples:
  frankenbeast                              # full interactive flow
  frankenbeast --design-doc design.md       # skip interview
  frankenbeast --plan-dir ./chunks/         # skip to execution
  frankenbeast interview                    # interview only
  frankenbeast plan --design-doc design.md  # plan only
  frankenbeast run                          # execute only
  frankenbeast run --resume                 # resume execution
`.trim();

export function printUsage(): void {
  console.log(USAGE);
}

export function parseArgs(argv: string[] = process.argv.slice(2)): CliArgs {
  // Extract subcommand if first positional arg matches
  let subcommand: Subcommand;
  let flagArgs = argv;
  if (argv.length > 0 && VALID_SUBCOMMANDS.has(argv[0]) && !argv[0].startsWith('-')) {
    subcommand = argv[0] as 'interview' | 'plan' | 'run';
    flagArgs = argv.slice(1);
  }

  const { values } = nodeParseArgs({
    args: flagArgs,
    options: {
      'base-dir': { type: 'string' },
      'base-branch': { type: 'string' },
      budget: { type: 'string' },
      provider: { type: 'string' },
      'design-doc': { type: 'string' },
      'plan-dir': { type: 'string' },
      config: { type: 'string' },
      'no-pr': { type: 'boolean', default: false },
      verbose: { type: 'boolean', default: false },
      reset: { type: 'boolean', default: false },
      resume: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
    strict: true,
  });

  const providerRaw = values.provider?.toLowerCase();
  const provider = providerRaw === 'codex' ? 'codex' : 'claude';

  return {
    subcommand,
    baseDir: values['base-dir'] ?? process.cwd(),
    baseBranch: values['base-branch'],
    budget: values.budget ? parseFloat(values.budget) : 10,
    provider,
    designDoc: values['design-doc'],
    planDir: values['plan-dir'],
    config: values.config,
    noPr: values['no-pr'] ?? false,
    verbose: values.verbose ?? false,
    reset: values.reset ?? false,
    resume: values.resume ?? false,
    help: values.help ?? false,
  };
}
```

## Test Cases

```typescript
import { describe, it, expect } from 'vitest';
import { parseArgs } from '../../../src/cli/args.js';

describe('parseArgs', () => {
  it('returns defaults with no args', () => {
    const args = parseArgs([]);
    expect(args.subcommand).toBeUndefined();
    expect(args.budget).toBe(10);
    expect(args.provider).toBe('claude');
    expect(args.noPr).toBe(false);
    expect(args.verbose).toBe(false);
    expect(args.reset).toBe(false);
    expect(args.resume).toBe(false);
    expect(args.help).toBe(false);
  });

  it('parses interview subcommand', () => {
    const args = parseArgs(['interview']);
    expect(args.subcommand).toBe('interview');
  });

  it('parses plan subcommand with design-doc', () => {
    const args = parseArgs(['plan', '--design-doc', '/path/to/design.md']);
    expect(args.subcommand).toBe('plan');
    expect(args.designDoc).toBe('/path/to/design.md');
  });

  it('parses run subcommand with resume', () => {
    const args = parseArgs(['run', '--resume']);
    expect(args.subcommand).toBe('run');
    expect(args.resume).toBe(true);
  });

  it('parses global flags without subcommand', () => {
    const args = parseArgs([
      '--base-dir', '/my/project',
      '--base-branch', 'develop',
      '--budget', '25',
      '--provider', 'codex',
      '--no-pr',
      '--verbose',
      '--reset',
    ]);
    expect(args.subcommand).toBeUndefined();
    expect(args.baseDir).toBe('/my/project');
    expect(args.baseBranch).toBe('develop');
    expect(args.budget).toBe(25);
    expect(args.provider).toBe('codex');
    expect(args.noPr).toBe(true);
    expect(args.verbose).toBe(true);
    expect(args.reset).toBe(true);
  });

  it('defaults provider to claude for unknown values', () => {
    const args = parseArgs(['--provider', 'unknown']);
    expect(args.provider).toBe('claude');
  });

  it('parses --design-doc without subcommand', () => {
    const args = parseArgs(['--design-doc', 'plan.md']);
    expect(args.subcommand).toBeUndefined();
    expect(args.designDoc).toBe('plan.md');
  });

  it('parses --plan-dir without subcommand', () => {
    const args = parseArgs(['--plan-dir', './chunks']);
    expect(args.subcommand).toBeUndefined();
    expect(args.planDir).toBe('./chunks');
  });

  it('parses --help', () => {
    const args = parseArgs(['--help']);
    expect(args.help).toBe(true);
  });

  it('parses --config', () => {
    const args = parseArgs(['--config', 'frankenbeast.json']);
    expect(args.config).toBe('frankenbeast.json');
  });
});
```

## Success Criteria

- [ ] `CliArgs` interface matches the spec above
- [ ] `parseArgs()` extracts subcommand as first positional arg
- [ ] All global flags parse correctly with proper defaults
- [ ] `printUsage()` displays updated help text
- [ ] Unknown provider values default to `'claude'`
- [ ] Budget parses as float from string
- [ ] All tests pass: `cd franken-orchestrator && npx vitest run tests/unit/cli/args.test.ts`
- [ ] `npx tsc --noEmit` passes

## Verification Command

```bash
cd franken-orchestrator && npx vitest run tests/unit/cli/args.test.ts && npx tsc --noEmit
```

## Hardening Requirements

- `strict: true` on `nodeParseArgs` — unknown flags throw
- Subcommand detection must NOT match flags (check `!argv[0].startsWith('-')`)
- `baseDir` defaults to `process.cwd()` — do NOT resolve paths here (that's project-root.ts)
- Export `Subcommand` type and `printUsage` function
- Use `.js` extensions in all import paths
