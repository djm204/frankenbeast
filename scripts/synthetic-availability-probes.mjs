#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readFile as nodeReadFile } from 'node:fs/promises';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const DEFAULT_TIMEOUT_MS = 5_000;
const OUTPUT_LIMIT_BYTES = 1024 * 1024;
const SECRET_LABEL_SOURCE = String.raw`(?:token|secret|password|passwd|authorization|bearer|oauth2[-_]?bearer|api[-_]?key|access[-_]?key|credential|private[-_]?key|signing[-_]?key)`;
const SECRET_ARG_PATTERN = new RegExp(SECRET_LABEL_SOURCE, 'iu');
const SECRET_ASSIGNMENT_PATTERN = new RegExp(String.raw`((?:["']?${SECRET_LABEL_SOURCE}[\w.-]*["']?\s*[=:]\s*))(["'])([^"']+)\2`, 'giu');
const SECRET_UNQUOTED_ASSIGNMENT_PATTERN = new RegExp(String.raw`((?:${SECRET_LABEL_SOURCE})[\w.-]*\s*[=:]\s*)\S+`, 'giu');
const SECRET_FLAG_VALUE_PATTERN = new RegExp(String.raw`((?:--?[\w-]*(?:${SECRET_LABEL_SOURCE})[\w-]*|(?:${SECRET_LABEL_SOURCE})[\w.-]*)\s+)\S+`, 'giu');
const TOKEN_LITERAL_PATTERN = /\b(?:sk-[A-Za-z0-9_-]{8,}|xox[abprs]-[A-Za-z0-9-]{8,}|ghp_[A-Za-z0-9_]{8,}|github_pat_[A-Za-z0-9_]{8,}|AKIA[0-9A-Z]{12,})\b/gu;
const BASIC_AUTH_FLAGS = new Set(['-u', '-U', '--user', '--proxy-user']);
function parseCommandLine(value) {
  if (!value) return undefined;
  if (Array.isArray(value)) return value.map(String);
  const words = [];
  let word = '';
  let quote = null;
  let escaping = false;
  let wordStarted = false;
  const input = String(value).trim();
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (escaping) {
      word += character;
      wordStarted = true;
      escaping = false;
    } else if (quote) {
      if (character === quote) quote = null;
      else if (quote !== "'" && character === '\\') {
        const next = input[index + 1];
        if (next && ['\\', '"', '$', '`', '\n'].includes(next)) escaping = true;
        else {
          word += character;
          wordStarted = true;
        }
      } else {
        word += character;
        wordStarted = true;
      }
    } else if (character === '\\') {
      escaping = true;
    } else if (character === '"' || character === "'") {
      quote = character;
      wordStarted = true;
    } else if (/\s/u.test(character)) {
      if (wordStarted) {
        words.push(word);
        word = '';
        wordStarted = false;
      }
    } else {
      word += character;
      wordStarted = true;
    }
  }
  if (escaping) {
    word += '\\';
    wordStarted = true;
  }
  if (quote) throw new Error(`unterminated quote in provider command: ${value}`);
  if (wordStarted) words.push(word);
  return words;
}

function parseCliArgs(argv) {
  const config = {
    repo: process.env.FRANKENBEAST_AVAILABILITY_REPO,
    kanbanDbPath: process.env.FRANKENBEAST_AVAILABILITY_KANBAN_DB ?? process.env.HERMES_KANBAN_DB,
    providerCommand: parseCommandLine(process.env.FRANKENBEAST_AVAILABILITY_PROVIDER_COMMAND),
    dashboardHealthUrl: process.env.FRANKENBEAST_AVAILABILITY_DASHBOARD_URL,
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
  return `Usage: node scripts/synthetic-availability-probes.mjs [--json|--text] [options]\n\nRead-only synthetic availability probes for critical Frankenbeast workflows.\n\nOptions:\n  --repo <owner/repo>          GitHub repo for issue inventory probe\n  --kanban-db <path>           Kanban SQLite database path\n  --provider-command <cmd>     Read-only provider status command (required; no fake default)\n  --dashboard-url <url>        Dashboard/backend health URL (required; no fake default)\n  --approval-ledger <path>     Approval ledger JSON path\n  --timeout-ms <ms>            Per-probe timeout (default: ${DEFAULT_TIMEOUT_MS})\n  --json                      Emit compact machine-readable JSON/JSONL\n  --pretty-json               Emit pretty-printed JSON for humans\n  --text                      Emit compact text (default)`;
}

function normalizeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return redactText(message);
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
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const killChildTree = (signal) => {
      try {
        process.kill(-child.pid, signal);
      } catch {
        child.kill(signal);
      }
    };
    const killTimer = setTimeout(() => {
      timedOut = true;
      killChildTree('SIGTERM');
      setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) killChildTree('SIGKILL');
      }, 500).unref();
    }, timeoutMs);
    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk);
      if (stdout.length > OUTPUT_LIMIT_BYTES) {
        stdout = `${stdout.slice(0, OUTPUT_LIMIT_BYTES)}\n[truncated]`;
        killChildTree('SIGTERM');
      }
    });
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
      if (stderr.length > OUTPUT_LIMIT_BYTES) {
        stderr = `${stderr.slice(0, OUTPUT_LIMIT_BYTES)}\n[truncated]`;
        killChildTree('SIGTERM');
      }
    });
    child.on('error', (error) => {
      clearTimeout(killTimer);
      reject(error);
    });
    child.on('close', (code, signal) => {
      clearTimeout(killTimer);
      if (timedOut) reject(new Error(`${file} timed out after ${timeoutMs}ms and was terminated`));
      else if (code === 0) resolve(stdout);
      else reject(new Error(`${file} exited with code ${code ?? signal}: ${redactText(stderr.trim() || stdout.trim())}`));
    });
  });
}

function redactText(value) {
  return String(value)
    .replace(/(Authorization:\s*)Basic\s+\S+(?:\s+\S+)?/giu, '$1Basic [REDACTED]')
    .replace(SECRET_ASSIGNMENT_PATTERN, '$1$2[REDACTED]$2')
    .replace(SECRET_UNQUOTED_ASSIGNMENT_PATTERN, '$1[REDACTED]')
    .replace(SECRET_FLAG_VALUE_PATTERN, '$1[REDACTED]')
    .replace(/(?<![\w-])Bearer\s+\S+/giu, 'Bearer [REDACTED]')
    .replace(/Basic\s+\S+/giu, 'Basic [REDACTED]')
    .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s'"<>]+/giu, (match) => redactUrl(match))
    .replace(TOKEN_LITERAL_PATTERN, '[REDACTED]');
}

function redactPathSegment(segment, url) {
  if (/^bot[^/]{8,}$/iu.test(segment)) return 'bot[REDACTED]';
  TOKEN_LITERAL_PATTERN.lastIndex = 0;
  if (TOKEN_LITERAL_PATTERN.test(segment)) return '[REDACTED]';
  TOKEN_LITERAL_PATTERN.lastIndex = 0;
  if (/hooks\.slack\.com$/iu.test(url.hostname) && url.pathname.startsWith('/services/')) return '[REDACTED]';
  return segment;
}

function redactUrl(value) {
  try {
    const url = new URL(String(value));
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    if (/hooks\.slack\.com$/iu.test(url.hostname) && url.pathname.startsWith('/services/')) {
      url.pathname = '/services/[REDACTED]';
    } else {
      url.pathname = url.pathname
        .split('/')
        .map((segment) => redactPathSegment(segment, url))
        .join('/');
    }
    return url.toString();
  } catch {
    return String(value);
  }
}
function isSecretArgumentLabel(value) {
  const text = String(value ?? '');
  return /^Bearer$/iu.test(text) || (!/^-----BEGIN-/u.test(text) && SECRET_ARG_PATTERN.test(text) && (/^--?[A-Za-z]/u.test(text) || /^[\w.-]+$/u.test(text)));
}

function redactCommand(command) {
  return command.map((part, index) => {
    const previous = command[index - 1] ?? '';
    const basicAuthAssignment = part.match(/^(--(?:proxy-)?user=).+/iu);
    if (basicAuthAssignment) return `${basicAuthAssignment[1]}[REDACTED]`;
    if (BASIC_AUTH_FLAGS.has(previous) || isSecretArgumentLabel(previous)) return '[REDACTED]';
    if (part.startsWith('Bearer ')) return '[REDACTED]';
    const redactedUrl = redactUrl(part);
    if (redactedUrl !== part) return redactedUrl;
    if (SECRET_ARG_PATTERN.test(part)) {
      const separator = part.includes('=') ? '=' : part.includes(':') ? ':' : null;
      if (separator) return `${part.slice(0, part.indexOf(separator) + 1)}[REDACTED]`;
      if (part.startsWith('-')) return part;
      return '[REDACTED]';
    }
    return part;
  });
}

function dashboardHealthRequest(value) {
  const url = new URL(String(value));
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`dashboard health URL must use http or https, got ${url.protocol || 'unknown'}`);
  }
  const headers = {};
  if (url.username || url.password) {
    const username = decodeURIComponent(url.username);
    const password = decodeURIComponent(url.password);
    headers.Authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
    url.username = '';
    url.password = '';
  }
  return { url: url.toString(), headers };
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
    const requiredTables = ['tasks', 'comments'];
    const tableRows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('tasks', 'comments')").all();
    const tables = new Set(tableRows.map((row) => String(row?.name ?? '')));
    const missingTables = requiredTables.filter((name) => !tables.has(name));
    if (missingTables.length > 0) throw new Error(`kanban db missing required tables: ${missingTables.join(', ')}`);
    return { path: config.kanbanDbPath, tables: requiredTables };
  } finally {
    db.close?.();
  }
}

async function probeProviderStatus(config, deps) {
  const command = parseCommandLine(config.providerCommand);
  if (!command || command.length === 0) throw new Error('missing provider status command');
  const [file, ...args] = command;
  const stdout = await deps.execFile(file, args, config.timeoutMs);
  return { command: redactCommand(command).join(' '), outputBytes: String(stdout ?? '').length };
}

async function probeDashboardHealth(config, deps) {
  if (!config.dashboardHealthUrl) throw new Error('missing dashboard health URL');
  const request = dashboardHealthRequest(config.dashboardHealthUrl);
  const response = await deps.fetch(request.url, {
    method: 'GET',
    redirect: 'manual',
    signal: AbortSignal.timeout(config.timeoutMs),
    ...(Object.keys(request.headers).length > 0 ? { headers: request.headers } : {}),
  });
  if (response?.redirected || (Number(response?.status) >= 300 && Number(response?.status) < 400)) {
    throw new Error(`dashboard health redirected with HTTP ${response?.status ?? 'unknown'}`);
  }
  if (!response?.ok) throw new Error(`dashboard health returned HTTP ${response?.status ?? 'unknown'}`);
  return { url: redactUrl(config.dashboardHealthUrl), status: response.status };
}

async function probeApprovalLedgerParse(config, deps) {
  if (!config.approvalLedgerPath) throw new Error('missing approval ledger path; pass --approval-ledger');
  const raw = await deps.readFile(config.approvalLedgerPath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('approval ledger contains invalid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('approval ledger must be a JSON object');
  }
  return { path: config.approvalLedgerPath, topLevelKeys: Object.keys(parsed).length };
}

export async function runSyntheticAvailabilityProbes(options = {}) {
  const config = {
    timeoutMs: DEFAULT_TIMEOUT_MS,

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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(normalizeError(error));
    process.exitCode = 2;
  });
}
