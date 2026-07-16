#!/usr/bin/env node
import { execFile as nodeExecFile } from 'node:child_process';
import { readFile as nodeReadFile } from 'node:fs/promises';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(nodeExecFile);

const DEFAULT_TIMEOUT_MS = 5_000;
function parseCommandLine(value) {
  if (!value) return undefined;
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  const words = [];
  let word = '';
  let quote = null;
  let escaping = false;
  for (const character of String(value).trim()) {
    if (escaping) {
      word += character;
      escaping = false;
    } else if (character === '\\') {
      escaping = true;
    } else if (quote) {
      if (character === quote) quote = null;
      else word += character;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (/\s/u.test(character)) {
      if (word) {
        words.push(word);
        word = '';
      }
    } else {
      word += character;
    }
  }
  if (escaping) word += '\\';
  if (quote) throw new Error(`unterminated quote in provider command: ${value}`);
  if (word) words.push(word);
  return words;
}

function parseCliArgs(argv) {
  const config = {
    repo: process.env.FRANKENBEAST_AVAILABILITY_REPO,
    kanbanDbPath: process.env.FRANKENBEAST_AVAILABILITY_KANBAN_DB ?? process.env.HERMES_KANBAN_DB,
    providerCommand: parseCommandLine(process.env.FRANKENBEAST_AVAILABILITY_PROVIDER_COMMAND) ?? ['node', '--version'],
    dashboardHealthUrl: process.env.FRANKENBEAST_AVAILABILITY_DASHBOARD_URL ?? 'http://127.0.0.1:3737/health',
    approvalLedgerPath: process.env.FRANKENBEAST_AVAILABILITY_APPROVAL_LEDGER,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    output: 'text',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value) throw new Error(`${arg} requires a value`);
      index += 1;
      return value;
    };
    if (arg === '--json') config.output = 'json';
    else if (arg === '--pretty-json') config.output = 'pretty-json';
    else if (arg === '--text') config.output = 'text';
    else if (arg === '--repo') config.repo = next();
    else if (arg === '--kanban-db') config.kanbanDbPath = next();
    else if (arg === '--provider-command') config.providerCommand = parseCommandLine(next());
    else if (arg === '--dashboard-url') config.dashboardHealthUrl = next();
    else if (arg === '--approval-ledger') config.approvalLedgerPath = next();
    else if (arg === '--timeout-ms') config.timeoutMs = Number(next());
    else if (arg === '--help' || arg === '-h') {
      config.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return config;
}

function usage() {
  return `Usage: node scripts/synthetic-availability-probes.mjs [--json|--text] [options]\n\nRead-only synthetic availability probes for critical Frankenbeast workflows.\n\nOptions:\n  --repo <owner/repo>          GitHub repo for issue inventory probe\n  --kanban-db <path>           Kanban SQLite database path\n  --provider-command <cmd>     Read-only provider status command (default: node --version)\n  --dashboard-url <url>        Dashboard health URL (default: http://127.0.0.1:3737/health)\n  --approval-ledger <path>     Approval ledger JSON path\n  --timeout-ms <ms>            Per-probe timeout (default: ${DEFAULT_TIMEOUT_MS})\n  --json                      Emit compact machine-readable JSON/JSONL\n  --pretty-json               Emit pretty-printed JSON for humans\n  --text                      Emit compact text (default)`;
}

function normalizeError(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function withTimeout(operation, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      operation(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function measureProbe(name, timeoutMs, remediationHint, operation, now = () => Date.now()) {
  const started = now();
  try {
    const detail = await withTimeout(operation, timeoutMs);
    return {
      name,
      status: 'healthy',
      latencyMs: Math.max(0, now() - started),
      timeoutMs,
      remediationHint,
      ...(detail === undefined ? {} : { detail }),
    };
  } catch (error) {
    return {
      name,
      status: 'unavailable',
      latencyMs: Math.max(0, now() - started),
      timeoutMs,
      remediationHint,
      error: normalizeError(error),
    };
  }
}

async function defaultExecFile(file, args, timeoutMs) {
  const result = await execFileAsync(file, args, { timeout: timeoutMs, maxBuffer: 1024 * 1024 });
  return result.stdout;
}

async function defaultOpenSqliteReadOnly(path) {
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const Database = require('better-sqlite3');
  return new Database(path, { readonly: true, fileMustExist: true });
}

async function probeGithubIssueRead(config, deps) {
  if (!config.repo) throw new Error('missing repo; pass --repo or FRANKENBEAST_AVAILABILITY_REPO');
  const stdout = await deps.execFile('gh', ['issue', 'list', '--repo', config.repo, '--limit', '1', '--json', 'number,title,state'], config.timeoutMs);
  const issues = JSON.parse(String(stdout || '[]'));
  if (!Array.isArray(issues)) throw new Error('gh issue list returned non-array JSON');
  return { repo: config.repo, issuesRead: issues.length };
}

async function probeKanbanRead(config, deps) {
  if (!config.kanbanDbPath) throw new Error('missing kanban db path; pass --kanban-db or HERMES_KANBAN_DB');
  const db = await deps.openSqliteReadOnly(config.kanbanDbPath);
  try {
    const tableRow = db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table'").get();
    return { path: config.kanbanDbPath, tables: Number(tableRow?.count ?? 0) };
  } finally {
    db.close?.();
  }
}

async function probeProviderStatus(config, deps) {
  const command = parseCommandLine(config.providerCommand);
  if (!command || command.length === 0) throw new Error('missing provider status command');
  const [file, ...args] = command;
  const stdout = await deps.execFile(file, args, config.timeoutMs);
  return { command: command.join(' '), outputBytes: String(stdout ?? '').length };
}

async function probeDashboardHealth(config, deps) {
  if (!config.dashboardHealthUrl) throw new Error('missing dashboard health URL');
  const response = await deps.fetch(config.dashboardHealthUrl, {
    method: 'GET',
    signal: AbortSignal.timeout(config.timeoutMs),
  });
  if (!response?.ok) throw new Error(`dashboard health returned HTTP ${response?.status ?? 'unknown'}`);
  return { url: config.dashboardHealthUrl, status: response.status };
}

async function probeApprovalLedgerParse(config, deps) {
  if (!config.approvalLedgerPath) throw new Error('missing approval ledger path; pass --approval-ledger');
  const raw = await deps.readFile(config.approvalLedgerPath, 'utf8');
  const parsed = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('approval ledger must be a JSON object');
  }
  return { path: config.approvalLedgerPath, topLevelKeys: Object.keys(parsed).length };
}

export async function runSyntheticAvailabilityProbes(options = {}) {
  const config = {
    timeoutMs: DEFAULT_TIMEOUT_MS,
    providerCommand: ['node', '--version'],
    dashboardHealthUrl: 'http://127.0.0.1:3737/health',
    ...(options.config ?? {}),
  };
  if (!Number.isFinite(config.timeoutMs) || config.timeoutMs <= 0) {
    throw new Error(`timeoutMs must be a positive finite number, got ${config.timeoutMs}`);
  }
  const deps = {
    execFile: options.execFile ?? defaultExecFile,
    fetch: options.fetch ?? globalThis.fetch,
    openSqliteReadOnly: options.openSqliteReadOnly ?? defaultOpenSqliteReadOnly,
    readFile: options.readFile ?? nodeReadFile,
  };
  const now = options.now ?? (() => Date.now());
  const probes = [];
  probes.push(await measureProbe('github_issue_read', config.timeoutMs, 'Check gh auth, GitHub API reachability, and repository access.', () => probeGithubIssueRead(config, deps), now));
  probes.push(await measureProbe('kanban_read', config.timeoutMs, 'Check the Kanban SQLite path and filesystem permissions; this probe opens the DB read-only.', () => probeKanbanRead(config, deps), now));
  probes.push(await measureProbe('provider_status', config.timeoutMs, 'Check provider CLI installation/authentication or set FRANKENBEAST_AVAILABILITY_PROVIDER_COMMAND.', () => probeProviderStatus(config, deps), now));
  probes.push(await measureProbe('dashboard_health', config.timeoutMs, 'Start the dashboard/chat server or update --dashboard-url to the active health endpoint.', () => probeDashboardHealth(config, deps), now));
  probes.push(await measureProbe('approval_ledger_parse', config.timeoutMs, 'Check approval ledger path, JSON validity, and read permissions.', () => probeApprovalLedgerParse(config, deps), now));

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    ok: probes.every((probe) => probe.status === 'healthy'),
    probes,
  };
}

export function formatProbeReportText(report) {
  const status = report.ok ? 'healthy' : 'unavailable';
  const lines = [`Synthetic availability probes: ${status}`];
  for (const probe of report.probes ?? []) {
    lines.push(`- ${probe.name} ${probe.status} ${probe.latencyMs}ms (timeout ${probe.timeoutMs}ms) — ${probe.remediationHint}`);
    if (probe.error) lines.push(`  error: ${probe.error}`);
  }
  return lines.join('\n');
}

async function main() {
  const config = parseCliArgs(process.argv.slice(2));
  if (config.help) {
    console.log(usage());
    return;
  }
  const report = await runSyntheticAvailabilityProbes({ config });
  if (config.output === 'json') console.log(JSON.stringify(report));
  else if (config.output === 'pretty-json') console.log(JSON.stringify(report, null, 2));
  else console.log(formatProbeReportText(report));
  if (!report.ok) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(normalizeError(error));
    process.exitCode = 2;
  });
}
