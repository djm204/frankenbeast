import { parseArgs as nodeParseArgs } from 'node:util';

export type Subcommand =
  | 'interview'
  | 'plan'
  | 'run'
  | 'issues'
  | 'chat'
  | 'chat-server'
  | 'network'
  | undefined;

export type NetworkAction =
  | 'up'
  | 'down'
  | 'status'
  | 'start'
  | 'stop'
  | 'restart'
  | 'logs'
  | 'config'
  | 'help'
  | undefined;

export interface CliArgs {
  subcommand: Subcommand;
  networkAction?: NetworkAction;
  networkTarget?: string | undefined;
  networkDetached: boolean;
  networkSet?: string[] | undefined;
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
  host?: string | undefined;
  port?: number | undefined;
  allowOrigin?: string | undefined;
  help: boolean;
  issueLabel?: string[] | undefined;
  issueMilestone?: string | undefined;
  issueSearch?: string | undefined;
  issueAssignee?: string | undefined;
  issueLimit?: number | undefined;
  issueRepo?: string | undefined;
  dryRun?: boolean | undefined;
}

const VALID_SUBCOMMANDS = new Set(['interview', 'plan', 'run', 'issues', 'chat', 'chat-server', 'network']);
const VALID_NETWORK_ACTIONS = new Set(['up', 'down', 'status', 'start', 'stop', 'restart', 'logs', 'config', 'help']);

const USAGE = `
Usage: frankenbeast [subcommand] [options]

Subcommands:
  interview               Gather requirements interactively, generate design doc
  plan --design-doc <f>   Decompose design doc into chunk files
  run                     Execute chunk files (from .frankenbeast/ or --plan-dir)
  issues                  Fetch and filter GitHub issues
  chat                    Interactive chat REPL with ConversationEngine
  chat-server             Run the local HTTP+WebSocket chat server for franken-web
  network                 Manage Frankenbeast request-serving services

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
  --host <host>           Chat server bind host (default: 127.0.0.1)
  --port <port>           Chat server bind port (default: 3000)
  --allow-origin <url>    Allow one additional websocket Origin
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

Network Commands:
  network up [-d]                     Start configured services
  network down                        Tear down managed services
  network status                      Show service health and URLs
  network start <service|all>         Start one managed service or all
  network stop <service|all>          Stop one managed service or all
  network restart <service|all>       Restart one managed service or all
  network logs <service|all>          Show service logs
  network config [--set a.b.c=value]  Inspect or update operator config
  network help                        Show network command help

Examples:
  frankenbeast                              # full interactive flow
  frankenbeast --design-doc design.md       # skip interview
  frankenbeast --plan-dir ./chunks/         # skip to execution
  frankenbeast interview                    # interview only
  frankenbeast plan --design-doc design.md  # plan only
  frankenbeast run                          # execute only
  frankenbeast run --resume                 # resume execution
  frankenbeast chat-server                  # local chat server
  frankenbeast chat-server --port 4242      # local chat server on custom port
  frankenbeast network up                   # start managed services
  frankenbeast network config --set chat.model=claude-sonnet-4-6
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
    subcommand = first as 'interview' | 'plan' | 'run' | 'issues' | 'chat' | 'chat-server';
    flagArgs = argv.slice(1);
  }

  const { values, positionals } = nodeParseArgs({
    args: flagArgs,
    options: {
      detached: { type: 'boolean', short: 'd', default: false },
      'base-dir': { type: 'string' },
      'base-branch': { type: 'string' },
      budget: { type: 'string' },
      provider: { type: 'string' },
      providers: { type: 'string' },
      'design-doc': { type: 'string' },
      'plan-dir': { type: 'string' },
      'plan-name': { type: 'string' },
      config: { type: 'string' },
      host: { type: 'string' },
      port: { type: 'string' },
      'allow-origin': { type: 'string' },
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
      set: { type: 'string', multiple: true },
    },
    allowPositionals: true,
    strict: true,
  });
  let networkAction: NetworkAction;
  let networkTarget: string | undefined;

  if (subcommand === 'network') {
    const actionCandidate = positionals[0];
    if (actionCandidate !== undefined) {
      if (!VALID_NETWORK_ACTIONS.has(actionCandidate)) {
        throw new TypeError(`Unknown network action: ${actionCandidate}`);
      }
      networkAction = actionCandidate as NetworkAction;
    }
    networkTarget = positionals[1];
  } else if (positionals.length > 0) {
    throw new TypeError(`Unexpected argument '${positionals[0]}'. This command does not take positional arguments`);
  }

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
    networkAction,
    networkTarget,
    networkDetached: values.detached ?? false,
    networkSet: values.set,
    baseDir: values['base-dir'] ?? process.cwd(),
    baseBranch: values['base-branch'],
    budget: values.budget ? parseFloat(values.budget) : 10,
    provider,
    providers,
    designDoc: values['design-doc'],
    planDir: values['plan-dir'],
    planName: values['plan-name'],
    config: values.config,
    host: values.host ?? (subcommand === 'chat-server' ? '127.0.0.1' : undefined),
    port: values.port ? parseInt(values.port, 10) : (subcommand === 'chat-server' ? 3000 : undefined),
    allowOrigin: values['allow-origin'],
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
