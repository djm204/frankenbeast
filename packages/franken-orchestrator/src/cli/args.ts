import { parseArgs as nodeParseArgs } from 'node:util';

export type Subcommand =
  | 'init'
  | 'interview'
  | 'plan'
  | 'run'
  | 'beasts'
  | 'issues'
  | 'chat'
  | 'chat-server'
  | 'network'
  | 'skill'
  | 'provider'
  | 'security'
  | 'dashboard'
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

export type BeastAction =
  | 'catalog'
  | 'spawn'
  | 'list'
  | 'status'
  | 'logs'
  | 'stop'
  | 'kill'
  | 'restart'
  | 'resume'
  | 'delete'
  | undefined;

export type SkillAction = 'list' | 'add' | 'remove' | 'enable' | 'disable' | 'info' | undefined;
export type ProviderAction = 'list' | 'add' | 'remove' | 'test' | undefined;
export type SecurityAction = 'status' | 'set' | undefined;

export interface CliArgs {
  subcommand: Subcommand;
  beastAction?: BeastAction;
  beastTarget?: string | undefined;
  networkAction?: NetworkAction;
  networkTarget?: string | undefined;
  networkDetached: boolean;
  networkSet?: string[] | undefined;
  skillAction?: SkillAction;
  skillTarget?: string | undefined;
  providerAction?: ProviderAction;
  providerTarget?: string | undefined;
  securityAction?: SecurityAction;
  securityTarget?: string | undefined;
  baseDir: string;
  baseBranch?: string | undefined;
  budget: number;
  provider: string;
  providers?: string[] | undefined;
  designDoc?: string | undefined;
  planDir?: string | undefined;
  planName?: string | undefined;
  outputDir?: string | undefined;
  interviewGoal?: string | undefined;
  interviewOutput?: string | undefined;
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
  targetUpstream?: boolean | undefined;
  dryRun?: boolean | undefined;
  initVerify: boolean;
  initRepair: boolean;
  initNonInteractive: boolean;
  moduleConfig?: import('../beasts/types.js').ModuleConfig | undefined;
}

const VALID_SUBCOMMANDS = new Set(['init', 'interview', 'plan', 'run', 'beasts', 'issues', 'chat', 'chat-server', 'network', 'skill', 'provider', 'security', 'dashboard']);
const VALID_NETWORK_ACTIONS = new Set(['up', 'down', 'status', 'start', 'stop', 'restart', 'logs', 'config', 'help']);
const VALID_BEAST_ACTIONS = new Set(['catalog', 'spawn', 'list', 'status', 'logs', 'stop', 'kill', 'restart', 'resume', 'delete']);
const VALID_SKILL_ACTIONS = new Set(['list', 'add', 'remove', 'enable', 'disable', 'info']);
const VALID_PROVIDER_ACTIONS = new Set(['list', 'add', 'remove', 'test']);
const VALID_SECURITY_ACTIONS = new Set(['status', 'set']);

const USAGE = `
Usage: frankenbeast [subcommand] [options]

Subcommands:
  init                    Guided setup for canonical Frankenbeast config
  interview               Gather requirements interactively, generate design doc
  plan --design-doc <f>   Decompose design doc into chunk files
  run                     Execute chunk files (from .fbeast/ or --plan-dir)
  beasts                  Dispatch and control Beast runs
  issues                  Fetch and filter GitHub issues
  chat                    Interactive chat REPL with ConversationEngine
  chat-server             Run the local HTTP+WebSocket chat server for franken-web
  network                 Manage Frankenbeast request-serving services
  skill                   Manage MCP skill plugins
  provider                Manage LLM providers
  security                View or change security profile
  dashboard               Launch the dashboard server

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
  --port <port>           Chat server bind port (default: 3737)
  --allow-origin <url>    Allow one additional websocket Origin
  --no-pr                 Skip PR creation
  --verbose               Debug logs + trace viewer
  --reset                 Clear checkpoint and traces
  --resume                Resume from checkpoint
  --cleanup               Remove all build logs, checkpoints, and traces
  --verify                Verify init config and readiness
  --repair                Re-run only missing or failed init steps
  --non-interactive       Disable interactive prompts for init
  --help                  Show this help message

Issue Flags (for 'issues' subcommand):
  --label <labels>        Comma-separated labels (e.g. critical,high)
  --milestone <name>      Filter by milestone
  --search <query>        Search issues by text
  --assignee <user>       Filter by assignee
  --limit <n>             Max issues to fetch (default: 30)
  --repo <owner/repo>     Target repository
  --target-upstream       Use the fork upstream as the canonical repo for issues and PRs
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

Beast Commands:
  beasts catalog                      List fixed Beast definitions
  beasts spawn <definition-id>        Spawn a Beast run via interactive prompts
  beasts list                         List Beast runs
  beasts status <run-id>              Show one Beast run
  beasts logs <run-id>                Show logs for the current attempt
  beasts stop <run-id>                Stop a running Beast
  beasts kill <run-id>                Force-stop a Beast
  beasts restart <run-id>             Restart a Beast with a new attempt
  beasts resume <agent-id>            Resume a tracked agent's linked run
  beasts delete <agent-id>            Soft-delete a tracked agent

Skill Commands:
  skill list                          List installed skills
  skill add <name>                    Install a custom skill
  skill remove <name>                 Remove an installed skill
  skill enable <name>                 Enable a skill
  skill disable <name>                Disable a skill
  skill info <name>                   Show skill details (MCP config, tools)

Provider Commands:
  provider list                       List configured providers
  provider add                        Show config instructions
  provider remove                     Show config instructions
  provider test [name]                Test provider availability

Security Commands:
  security status                     Show current security profile settings
  security set <profile>              Set security profile (strict|standard|permissive)

Module Toggles (for beasts spawn):
  --no-firewall                       Disable firewall module
  --no-skills                         Disable skills module
  --no-memory                         Disable memory module
  --no-planner                        Disable planner module
  --no-critique                       Disable critique module
  --no-governor                       Disable governor module
  --no-heartbeat                      Disable heartbeat module

Examples:
  frankenbeast                              # full interactive flow
  frankenbeast --design-doc design.md       # skip interview
  frankenbeast --plan-dir ./chunks/         # skip to execution
  frankenbeast interview                    # interview only
  frankenbeast plan --design-doc design.md  # plan only
  frankenbeast run                          # execute only
  frankenbeast run --resume                 # resume execution
  frankenbeast init                         # guided init wizard
  frankenbeast init --verify                # verify init readiness
  frankenbeast beasts spawn martin-loop     # spawn a martin-loop beast
  frankenbeast chat-server                  # local chat server
  frankenbeast chat-server --port 4242      # local chat server on custom port
  frankenbeast network up                   # start managed services
  frankenbeast network config --set chat.model=claude-sonnet-4-6
  frankenbeast issues --label critical,high # fetch filtered issues
  frankenbeast issues --dry-run             # preview issue fetch
  frankenbeast skill list                   # list installed skills
  frankenbeast skill add my-tool            # scaffold a new skill
  frankenbeast skill enable my-tool         # enable a skill
  frankenbeast skill info my-tool           # show skill details
  frankenbeast provider list                # list configured providers
  frankenbeast provider test                # test provider availability
  frankenbeast security status              # show security profile
  frankenbeast security set strict          # change security profile
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
    subcommand = first as 'init' | 'interview' | 'plan' | 'run' | 'beasts' | 'issues' | 'chat' | 'chat-server' | 'network' | 'skill' | 'provider' | 'security' | 'dashboard';
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
      'output-dir': { type: 'string' },
      goal: { type: 'string' },
      output: { type: 'string' },
      config: { type: 'string' },
      host: { type: 'string' },
      port: { type: 'string' },
      'allow-origin': { type: 'string' },
      'no-pr': { type: 'boolean', default: false },
      verbose: { type: 'boolean', default: false },
      reset: { type: 'boolean', default: false },
      resume: { type: 'boolean', default: false },
      cleanup: { type: 'boolean', default: false },
      verify: { type: 'boolean', default: false },
      repair: { type: 'boolean', default: false },
      'non-interactive': { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
      label: { type: 'string' },
      milestone: { type: 'string' },
      search: { type: 'string' },
      assignee: { type: 'string' },
      limit: { type: 'string' },
      repo: { type: 'string' },
      'target-upstream': { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      set: { type: 'string', multiple: true },
      'no-firewall': { type: 'boolean', default: false },
      'no-skills': { type: 'boolean', default: false },
      'no-memory': { type: 'boolean', default: false },
      'no-planner': { type: 'boolean', default: false },
      'no-critique': { type: 'boolean', default: false },
      'no-governor': { type: 'boolean', default: false },
      'no-heartbeat': { type: 'boolean', default: false },
    },
    allowPositionals: true,
    strict: true,
  });
  let networkAction: NetworkAction;
  let networkTarget: string | undefined;
  let beastAction: BeastAction;
  let beastTarget: string | undefined;
  let skillAction: SkillAction;
  let skillTarget: string | undefined;
  let providerAction: ProviderAction;
  let providerTarget: string | undefined;
  let securityAction: SecurityAction;
  let securityTarget: string | undefined;

  if (subcommand === 'network') {
    const actionCandidate = positionals[0];
    if (actionCandidate !== undefined) {
      if (!VALID_NETWORK_ACTIONS.has(actionCandidate)) {
        throw new TypeError(`Unknown network action: ${actionCandidate}`);
      }
      networkAction = actionCandidate as NetworkAction;
    }
    networkTarget = positionals[1];
  } else if (subcommand === 'beasts') {
    const actionCandidate = positionals[0];
    if (actionCandidate !== undefined) {
      if (!VALID_BEAST_ACTIONS.has(actionCandidate)) {
        throw new TypeError(`Unknown beast action: ${actionCandidate}`);
      }
      beastAction = actionCandidate as BeastAction;
    }
    beastTarget = positionals[1];
  } else if (subcommand === 'skill') {
    const actionCandidate = positionals[0];
    if (actionCandidate !== undefined) {
      if (!VALID_SKILL_ACTIONS.has(actionCandidate)) {
        throw new TypeError(`Unknown skill action: ${actionCandidate}`);
      }
      skillAction = actionCandidate as SkillAction;
    }
    skillTarget = positionals[1];
  } else if (subcommand === 'provider') {
    const actionCandidate = positionals[0];
    if (actionCandidate !== undefined) {
      if (!VALID_PROVIDER_ACTIONS.has(actionCandidate)) {
        throw new TypeError(`Unknown provider action: ${actionCandidate}`);
      }
      providerAction = actionCandidate as ProviderAction;
    }
    providerTarget = positionals[1];
  } else if (subcommand === 'security') {
    const actionCandidate = positionals[0];
    if (actionCandidate !== undefined) {
      if (!VALID_SECURITY_ACTIONS.has(actionCandidate)) {
        throw new TypeError(`Unknown security action: ${actionCandidate}`);
      }
      securityAction = actionCandidate as SecurityAction;
    }
    securityTarget = positionals[1];
    if (securityAction === 'set' && securityTarget !== undefined) {
      const validProfiles = new Set(['strict', 'standard', 'permissive']);
      if (!validProfiles.has(securityTarget)) {
        throw new TypeError(`Invalid security profile '${securityTarget}'. Valid: strict, standard, permissive`);
      }
    }
  } else if (subcommand === 'dashboard') {
    // dashboard has no actions — just starts the server
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

  if (subcommand === 'issues' && values.repo && values['target-upstream']) {
    throw new TypeError(
      'Cannot use --repo with --target-upstream: --repo explicitly selects the canonical repository, while --target-upstream derives it from the fork upstream remote.',
    );
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

  const hasModuleFlags = values['no-firewall'] || values['no-skills'] || values['no-memory']
    || values['no-planner'] || values['no-critique'] || values['no-governor'] || values['no-heartbeat'];

  const moduleConfig = hasModuleFlags
    ? {
        ...(values['no-firewall'] ? { firewall: false } : {}),
        ...(values['no-skills'] ? { skills: false } : {}),
        ...(values['no-memory'] ? { memory: false } : {}),
        ...(values['no-planner'] ? { planner: false } : {}),
        ...(values['no-critique'] ? { critique: false } : {}),
        ...(values['no-governor'] ? { governor: false } : {}),
        ...(values['no-heartbeat'] ? { heartbeat: false } : {}),
      } as import('../beasts/types.js').ModuleConfig
    : undefined;

  return {
    subcommand,
    beastAction,
    beastTarget,
    networkAction,
    networkTarget,
    networkDetached: values.detached ?? false,
    networkSet: values.set,
    skillAction,
    skillTarget,
    providerAction,
    providerTarget,
    securityAction,
    securityTarget,
    baseDir: values['base-dir'] ?? process.cwd(),
    baseBranch: values['base-branch'],
    budget: values.budget ? parseFloat(values.budget) : 10,
    provider,
    providers,
    designDoc: values['design-doc'],
    planDir: values['plan-dir'],
    planName: values['plan-name'],
    outputDir: values['output-dir'],
    interviewGoal: values.goal,
    interviewOutput: values.output,
    config: values.config,
    host: values.host ?? (subcommand === 'chat-server' ? '127.0.0.1' : undefined),
    port: values.port ? parseInt(values.port, 10) : (subcommand === 'chat-server' ? 3737 : undefined),
    allowOrigin: values['allow-origin'],
    noPr: values['no-pr'] ?? false,
    verbose: values.verbose ?? false,
    reset: values.reset ?? false,
    resume: values.resume ?? false,
    cleanup: values.cleanup ?? false,
    initVerify: values.verify ?? false,
    initRepair: values.repair ?? false,
    initNonInteractive: values['non-interactive'] ?? false,
    help: values.help ?? false,
    issueLabel,
    issueMilestone: values.milestone,
    issueSearch: values.search,
    issueAssignee: values.assignee,
    issueLimit,
    issueRepo: values.repo,
    targetUpstream: values['target-upstream'] ?? undefined,
    dryRun: values['dry-run'] ?? undefined,
    moduleConfig,
  };
}
