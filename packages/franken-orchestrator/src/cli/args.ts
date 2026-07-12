import { parseArgs as nodeParseArgs } from 'node:util';


function printLine(...args: unknown[]): void {
  console.info(...args);
}
export type Subcommand =
  | 'init'
  | 'interview'
  | 'plan'
  | 'run'
  | 'beasts'
  | 'issues'
  | 'chat'
  | 'chat-server'
  | 'beasts-daemon'
  | 'network'
  | 'skill'
  | 'security'
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
  | 'create'
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

export type SkillAction = 'list' | 'add' | 'scaffold' | 'remove' | 'enable' | 'disable' | 'info' | undefined;
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
  skillCommand?: string | undefined;
  skillCommandArgs?: string[] | undefined;
  securityAction?: SecurityAction;
  securityTarget?: string | undefined;
  baseDir: string;
  baseBranch?: string | undefined;
  budget: number;
  provider: string;
  providerSpecified?: boolean | undefined;
  providers?: string[] | undefined;
  trustProviderCommandOverrides?: boolean | undefined;
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
  initBackend?: string | undefined;
  beastExecutionMode?: import('../beasts/types.js').BeastExecutionMode | undefined;
  moduleConfig?: import('../beasts/types.js').ModuleConfig | undefined;
}

const VALID_SUBCOMMANDS = new Set(['init', 'interview', 'plan', 'run', 'beasts', 'issues', 'chat', 'chat-server', 'beasts-daemon', 'network', 'skill', 'security']);
const VALID_NETWORK_ACTIONS = new Set(['up', 'down', 'status', 'start', 'stop', 'restart', 'logs', 'config', 'help']);
const VALID_BEAST_ACTIONS = new Set(['catalog', 'create', 'spawn', 'list', 'status', 'logs', 'stop', 'kill', 'restart', 'resume', 'delete']);
const VALID_SKILL_ACTIONS = new Set(['list', 'add', 'scaffold', 'remove', 'enable', 'disable', 'info']);
const VALID_SECURITY_ACTIONS = new Set(['status', 'set']);
const STRING_OPTIONS = new Set([
  'base-dir', 'base-branch', 'budget', 'provider', 'providers', 'design-doc', 'plan-dir', 'plan-name', 'output-dir',
  'goal', 'output', 'config', 'host', 'port', 'allow-origin', 'label', 'milestone', 'search', 'assignee', 'limit',
  'repo', 'mode', 'set', 'backend',
]);
const BOOLEAN_SHORT_OPTIONS = new Set(['d']);
const DECIMAL_PATTERN = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;
const INTEGER_PATTERN = /^[+-]?\d+$/;

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
  beasts-daemon           Run the standalone Beast control-plane daemon
  network                 Manage Frankenbeast request-serving services
  skill                   Manage MCP skill plugins
  security                View or change security profile

Options:
  --base-dir <path>       Project root (default: cwd)
  --base-branch <name>    Git base branch (default: main)
  --budget <usd>          Budget limit in USD (default: 10)
  --provider <name>       Provider name (default: claude)
  --providers <list>      Comma-separated fallback chain (e.g. claude,gemini,aider)
  --trust-provider-command-overrides
                           Explicitly approve trusted repo-configured provider command overrides
  --design-doc <path>     Path to design document
  --plan-dir <path>       Path to chunk files directory
  --plan-name <name>      Plan name (default: auto-generated from date)
  --config <path>         Path to config file (JSON)
  --host <host>           Chat/beast daemon bind host (default: 127.0.0.1)
  --port <port>           Chat/beast daemon bind port (chat default: 3737; beast daemon default: 4050)
  --allow-origin <url>    Allow one additional websocket Origin
  --no-pr                 Skip PR creation
  --verbose               Debug logs + trace viewer
  --reset                 Clear checkpoint and traces
  --resume                Resume from checkpoint
  --cleanup               Remove build artifacts without following symlinked entries
  --verify                Verify init config and readiness
  --repair                Re-run only missing or failed init steps
  --non-interactive       Disable interactive prompts for init
  --backend <name>        Init secret backend: local-encrypted, os-keychain, 1password, bitwarden
  --help                  Show this help message

Non-interactive HITL:
  Required HITL gates fail closed in non-TTY runs. In trusted CI/headless
  automation, set FRANKENBEAST_ALLOW_NONINTERACTIVE_APPROVAL=1 to explicitly
  allow those required approvals; otherwise rerun in an interactive TTY.

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
  beasts create <definition-id>       Create a Beast run (alias for spawn; use --mode process|container)
  beasts spawn <definition-id>        Spawn a Beast run via interactive prompts (use --mode process|container)
  beasts list                         List Beast runs
  beasts status <run-id>              Show one Beast run, including container fields when present
  beasts logs <run-id>                Show logs for the current attempt, including container context when present
  beasts stop <run-id>                Stop a running Beast
  beasts kill <run-id>                Force-stop a Beast
  beasts restart <run-id>             Restart a Beast with a new attempt
  beasts resume <agent-id>            Resume a tracked agent's linked run
  beasts delete <agent-id>            Soft-delete a tracked agent

Skill Commands:
  skill list                          List installed skills
  skill add <name> <command> [args]   Install a custom skill with runnable MCP command
  skill scaffold <name>               Scaffold an incomplete custom skill for manual config
  skill remove <name>                 Remove an installed skill
  skill enable <name>                 Enable a skill
  skill disable <name>                Disable a skill
  skill info <name>                   Show skill details (MCP config, tools)

Security Commands:
  security status                     Show current security profile settings
  security set <profile>              Set security profile (strict|standard|permissive)

Module Toggles (for beasts spawn):
  --mode <mode>                        Execution mode for beasts create/spawn: process|container (default: process)
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
  frankenbeast beasts-daemon                # standalone Beast API on port 4050
  frankenbeast network up                   # start managed services
  frankenbeast network config --set chat.model=claude-sonnet-4-6
  frankenbeast issues --label critical,high # fetch filtered issues
  frankenbeast issues --dry-run             # preview issue fetch
  frankenbeast skill list                   # list installed skills
  frankenbeast skill add my-tool node ./server.js     # install a runnable skill
  frankenbeast skill scaffold my-tool       # scaffold a skill for manual config
  frankenbeast skill enable my-tool         # enable a skill
  frankenbeast skill info my-tool           # show skill details
  frankenbeast security status              # show security profile
  frankenbeast security set strict          # change security profile
`.trim();

export function printUsage(): void {
  printLine(USAGE);
}

function splitSkillAddArgs(args: string[]): { isSkillAdd: boolean; parsedFlagArgs: string[]; rawSkillAddCommandArgs: string[] } {
  let positionalCount = 0;
  let isSkillAdd = false;
  let commandIndex = args.length;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === undefined) break;

    if (arg === '--') {
      continue;
    }

    if (positionalCount < 3 && arg.startsWith('--')) {
      const optionName = arg.slice(2).split('=', 1)[0] ?? '';
      if (STRING_OPTIONS.has(optionName) && !arg.includes('=')) {
        i += 1;
      }
      continue;
    }

    if (positionalCount < 3 && arg.startsWith('-') && !arg.startsWith('--')) {
      const shortName = arg.slice(1, 2);
      if (BOOLEAN_SHORT_OPTIONS.has(shortName)) {
        continue;
      }
    }

    positionalCount += 1;
    if (positionalCount === 1) {
      if (arg !== 'add') {
        return { isSkillAdd: false, parsedFlagArgs: args, rawSkillAddCommandArgs: [] };
      }
      isSkillAdd = true;
    }
    if (positionalCount === 3) {
      commandIndex = i;
      break;
    }
  }

  let rawSkillAddCommandArgs = args.slice(commandIndex + 1);
  if (rawSkillAddCommandArgs[0] === '--') {
    rawSkillAddCommandArgs = rawSkillAddCommandArgs.slice(1);
  }

  return {
    isSkillAdd,
    parsedFlagArgs: args.slice(0, commandIndex + 1),
    rawSkillAddCommandArgs,
  };
}

function parseFiniteDecimalOption(name: string, value: string, options: { min?: number; minExclusive?: number } = {}): number {
  const trimmed = value.trim();
  if (!DECIMAL_PATTERN.test(trimmed)) {
    throw new TypeError(`Invalid ${name}: expected a finite number, got '${value}'`);
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    throw new TypeError(`Invalid ${name}: expected a finite number, got '${value}'`);
  }

  if (options.min !== undefined && parsed < options.min) {
    throw new TypeError(`Invalid ${name}: expected a value >= ${options.min}, got ${value}`);
  }
  if (options.minExclusive !== undefined && parsed <= options.minExclusive) {
    throw new TypeError(`Invalid ${name}: expected a value > ${options.minExclusive}, got ${value}`);
  }

  return parsed;
}

function parseIntegerOption(name: string, value: string, options: { min?: number; max?: number } = {}): number {
  const trimmed = value.trim();
  if (!INTEGER_PATTERN.test(trimmed)) {
    throw new TypeError(`Invalid ${name}: expected an integer, got '${value}'`);
  }

  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed)) {
    throw new TypeError(`Invalid ${name}: expected a safe integer, got '${value}'`);
  }

  if (options.min !== undefined && parsed < options.min) {
    throw new TypeError(`Invalid ${name}: expected a value >= ${options.min}, got ${value}`);
  }
  if (options.max !== undefined && parsed > options.max) {
    throw new TypeError(`Invalid ${name}: expected a value <= ${options.max}, got ${value}`);
  }

  return parsed;
}

export function parseArgs(argv: string[] = process.argv.slice(2)): CliArgs {
  // Extract subcommand if first positional arg matches
  let subcommand: Subcommand;
  let flagArgs = argv;
  const first = argv[0];
  if (first !== undefined && VALID_SUBCOMMANDS.has(first) && !first.startsWith('-')) {
    subcommand = first as 'init' | 'interview' | 'plan' | 'run' | 'beasts' | 'issues' | 'chat' | 'chat-server' | 'beasts-daemon' | 'network' | 'skill' | 'security';
    flagArgs = argv.slice(1);
  }

  let rawSkillAddCommandArgs: string[] | undefined;
  let parsedFlagArgs = flagArgs;
  if (subcommand === 'skill') {
    const split = splitSkillAddArgs(flagArgs);
    if (split.isSkillAdd) {
      parsedFlagArgs = split.parsedFlagArgs;
      rawSkillAddCommandArgs = split.rawSkillAddCommandArgs;
    }
  }

  const { values, positionals } = nodeParseArgs({
    args: parsedFlagArgs,
    options: {
      detached: { type: 'boolean', short: 'd', default: false },
      'base-dir': { type: 'string' },
      'base-branch': { type: 'string' },
      budget: { type: 'string' },
      provider: { type: 'string' },
      providers: { type: 'string' },
      'trust-provider-command-overrides': { type: 'boolean', default: false },
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
      backend: { type: 'string' },
      help: { type: 'boolean', default: false },
      label: { type: 'string' },
      milestone: { type: 'string' },
      search: { type: 'string' },
      assignee: { type: 'string' },
      limit: { type: 'string' },
      repo: { type: 'string' },
      'target-upstream': { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      mode: { type: 'string' },
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
  let skillCommand: string | undefined;
  let skillCommandArgs: string[] | undefined;
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
    skillCommand = positionals[2];
    skillCommandArgs = rawSkillAddCommandArgs !== undefined
      ? rawSkillAddCommandArgs
      : positionals.length > 3 ? positionals.slice(3) : undefined;
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
  } else if (positionals.length > 0) {
    throw new TypeError(`Unexpected argument '${positionals[0]}'. This command does not take positional arguments`);
  }

  const provider = values.provider?.toLowerCase() ?? 'claude';

  const beastExecutionModeRaw = values.mode?.toLowerCase();
  let beastExecutionMode: import('../beasts/types.js').BeastExecutionMode | undefined;
  if (beastExecutionModeRaw !== undefined) {
    if (beastExecutionModeRaw !== 'process' && beastExecutionModeRaw !== 'container') {
      throw new TypeError(`Invalid beast execution mode '${values.mode}'. Valid: process, container`);
    }
    beastExecutionMode = beastExecutionModeRaw;
  }

  if (beastExecutionMode !== undefined && subcommand !== 'beasts') {
    throw new TypeError('--mode is only supported for beasts commands');
  }

  if (
    beastExecutionMode !== undefined
    && beastAction !== undefined
    && beastAction !== 'create'
    && beastAction !== 'spawn'
    && beastAction !== 'status'
    && beastAction !== 'logs'
  ) {
    throw new TypeError('--mode is only supported for beasts create, spawn, status, and logs');
  }

  if (values.backend !== undefined && subcommand !== 'init') {
    throw new TypeError('--backend is only supported for init');
  }

  const initBackend = values.backend?.toLowerCase();
  if (initBackend !== undefined) {
    const validBackends = new Set(['local-encrypted', 'os-keychain', '1password', 'bitwarden']);
    if (!validBackends.has(initBackend)) {
      throw new TypeError(`Invalid init backend '${values.backend}'. Valid: local-encrypted, os-keychain, 1password, bitwarden`);
    }
  }

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
    issueLimit = parseIntegerOption('--limit', limitRaw, { min: 1 });
  } else if (subcommand === 'issues') {
    issueLimit = 30;
  }

  const budget = values.budget !== undefined
    ? parseFiniteDecimalOption('--budget', values.budget, { minExclusive: 0 })
    : 10;
  const port = values.port !== undefined
    ? parseIntegerOption('--port', values.port, { min: 0, max: 65535 })
    : (subcommand === 'chat-server' ? 3737 : subcommand === 'beasts-daemon' ? 4050 : undefined);

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
    skillCommand,
    skillCommandArgs,
    securityAction,
    securityTarget,
    baseDir: values['base-dir'] ?? process.cwd(),
    baseBranch: values['base-branch'],
    budget,
    provider,
    providerSpecified: values.provider !== undefined,
    providers,
    trustProviderCommandOverrides: values['trust-provider-command-overrides'] ?? false,
    designDoc: values['design-doc'],
    planDir: values['plan-dir'],
    planName: values['plan-name'],
    outputDir: values['output-dir'],
    interviewGoal: values.goal,
    interviewOutput: values.output,
    config: values.config,
    host: values.host ?? (subcommand === 'chat-server' || subcommand === 'beasts-daemon' ? '127.0.0.1' : undefined),
    port,
    allowOrigin: values['allow-origin'],
    noPr: values['no-pr'] ?? false,
    verbose: values.verbose ?? false,
    reset: values.reset ?? false,
    resume: values.resume ?? false,
    cleanup: values.cleanup ?? false,
    initVerify: values.verify ?? false,
    initRepair: values.repair ?? false,
    initNonInteractive: values['non-interactive'] ?? false,
    initBackend,
    help: values.help ?? false,
    issueLabel,
    issueMilestone: values.milestone,
    issueSearch: values.search,
    issueAssignee: values.assignee,
    issueLimit,
    issueRepo: values.repo,
    targetUpstream: values['target-upstream'] ?? undefined,
    dryRun: values['dry-run'] ?? undefined,
    beastExecutionMode,
    moduleConfig,
  };
}
