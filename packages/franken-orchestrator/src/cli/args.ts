import { parseArgs as nodeParseArgs } from 'node:util';

export type Subcommand = 'interview' | 'plan' | 'run' | 'issues' | 'chat' | undefined;

export interface CliArgs {
  subcommand: Subcommand;
  baseDir: string;
  baseBranch?: string | undefined;
  budget: number;
  provider: string;
  providers?: string[] | undefined;
  designDoc?: string | undefined;
  planDir?: string | undefined;
  planName?: string | undefined;
  noPr: boolean;
  verbose: boolean;
  reset: boolean;
  resume: boolean;
  cleanup: boolean;
  config?: string | undefined;
  help: boolean;
  issueLabel?: string[] | undefined;
  issueMilestone?: string | undefined;
  issueSearch?: string | undefined;
  issueAssignee?: string | undefined;
  issueLimit?: number | undefined;
  issueRepo?: string | undefined;
  dryRun?: boolean | undefined;
}

const VALID_SUBCOMMANDS = new Set(['interview', 'plan', 'run', 'issues', 'chat']);

const USAGE = `
Usage: frankenbeast [subcommand] [options]

Subcommands:
  interview               Gather requirements interactively, generate design doc
  plan --design-doc <f>   Decompose design doc into chunk files
  run                     Execute chunk files (from .frankenbeast/ or --plan-dir)
  issues                  Fetch and filter GitHub issues
  chat                    Interactive chat REPL with ConversationEngine

Options:
  --base-dir <path>       Project root (default: cwd)
  --base-branch <name>    Git base branch (default: main)
  --budget <usd>          Budget limit in USD (default: 10)
  --provider <name>       Provider name (default: claude)
  --providers <list>      Comma-separated fallback chain (e.g. claude,gemini,aider)
  --design-doc <path>     Path to design document
  --plan-dir <path>       Path to chunk files directory
  --plan-name <name>      Plan name (default: auto-generated from date)
  --config <path>         Path to config file (JSON)
  --no-pr                 Skip PR creation
  --verbose               Debug logs + trace viewer
  --reset                 Clear checkpoint and traces
  --resume                Resume from checkpoint
  --cleanup               Remove all build logs, checkpoints, and traces
  --help                  Show this help message

Issue Flags (for 'issues' subcommand):
  --label <labels>        Comma-separated labels (e.g. critical,high)
  --milestone <name>      Filter by milestone
  --search <query>        Search issues by text
  --assignee <user>       Filter by assignee
  --limit <n>             Max issues to fetch (default: 30)
  --repo <owner/repo>     Target repository
  --dry-run               Preview without executing

Examples:
  frankenbeast                              # full interactive flow
  frankenbeast --design-doc design.md       # skip interview
  frankenbeast --plan-dir ./chunks/         # skip to execution
  frankenbeast interview                    # interview only
  frankenbeast plan --design-doc design.md  # plan only
  frankenbeast run                          # execute only
  frankenbeast run --resume                 # resume execution
  frankenbeast issues --label critical,high # fetch filtered issues
  frankenbeast issues --dry-run             # preview issue fetch
`.trim();

export function printUsage(): void {
  console.log(USAGE);
}

export function parseArgs(argv: string[] = process.argv.slice(2)): CliArgs {
  // Extract subcommand if first positional arg matches
  let subcommand: Subcommand;
  let flagArgs = argv;
  const first = argv[0];
  if (first !== undefined && VALID_SUBCOMMANDS.has(first) && !first.startsWith('-')) {
    subcommand = first as 'interview' | 'plan' | 'run' | 'issues' | 'chat';
    flagArgs = argv.slice(1);
  }

  const { values } = nodeParseArgs({
    args: flagArgs,
    options: {
      'base-dir': { type: 'string' },
      'base-branch': { type: 'string' },
      budget: { type: 'string' },
      provider: { type: 'string' },
      providers: { type: 'string' },
      'design-doc': { type: 'string' },
      'plan-dir': { type: 'string' },
      'plan-name': { type: 'string' },
      config: { type: 'string' },
      'no-pr': { type: 'boolean', default: false },
      verbose: { type: 'boolean', default: false },
      reset: { type: 'boolean', default: false },
      resume: { type: 'boolean', default: false },
      cleanup: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
      label: { type: 'string' },
      milestone: { type: 'string' },
      search: { type: 'string' },
      assignee: { type: 'string' },
      limit: { type: 'string' },
      repo: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
    strict: true,
  });

  const provider = values.provider?.toLowerCase() ?? 'claude';

  const providersRaw = values.providers;
  const providers = providersRaw
    ? providersRaw.split(',').map((p) => p.trim().toLowerCase())
    : undefined;

  // Warn on conflicting flags
  if (subcommand === 'issues' && values['design-doc']) {
    console.warn('Warning: --design-doc is not relevant for the issues subcommand');
  }

  const labelRaw = values.label;
  const issueLabel = labelRaw
    ? labelRaw.split(',').map((l) => l.trim())
    : undefined;

  const limitRaw = values.limit;
  let issueLimit: number | undefined;
  if (limitRaw !== undefined) {
    issueLimit = parseInt(limitRaw, 10);
  } else if (subcommand === 'issues') {
    issueLimit = 30;
  }

  return {
    subcommand,
    baseDir: values['base-dir'] ?? process.cwd(),
    baseBranch: values['base-branch'],
    budget: values.budget ? parseFloat(values.budget) : 10,
    provider,
    providers,
    designDoc: values['design-doc'],
    planDir: values['plan-dir'],
    planName: values['plan-name'],
    config: values.config,
    noPr: values['no-pr'] ?? false,
    verbose: values.verbose ?? false,
    reset: values.reset ?? false,
    resume: values.resume ?? false,
    cleanup: values.cleanup ?? false,
    help: values.help ?? false,
    issueLabel,
    issueMilestone: values.milestone,
    issueSearch: values.search,
    issueAssignee: values.assignee,
    issueLimit,
    issueRepo: values.repo,
    dryRun: values['dry-run'] ?? undefined,
  };
}
