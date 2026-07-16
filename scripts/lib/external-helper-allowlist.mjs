import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ALLOWLIST_URL = new URL('../external-helper-allowlist.json', import.meta.url);
const SHA256_RE = /^[a-f0-9]{64}$/u;
const HELPER_ID_RE = /^[a-z0-9][a-z0-9_.:-]{0,127}$/u;
const ARG_CLASS_RE = /^[a-z][a-z0-9:-]{0,63}$/u;

const KNOWN_ARGUMENT_CLASS_VALIDATORS = Object.freeze({
  'git-readonly': (command) => command[0] === 'git' && new Set(['rev-parse', 'fetch', 'branch', '-C']).has(command[1]),
  'git-worktree-create': (command) => command[0] === 'git' && command[1] === 'worktree' && command[2] === 'add',
  'git-worktree-config': (command) => command[0] === 'git' && command[1] === '-C' && command[3] === 'config'
    && (command.includes('user.email') || command.includes('user.name') || command.includes('extensions.worktreeConfig')),
  'gh-pr-readonly': (command) => command[0] === 'gh' && command[1] === 'pr' && ['list', 'view', 'checks'].includes(command[2]),
  'npm-test-runner': (command) => command[0] === 'npm' && command[1] === 'run' && typeof command[2] === 'string',
  'npx-turbo-test-runner': (command) => command[0] === 'npx' && command[1] === 'turbo',
});

function normalizeRepoRelativePath(filePath, repoRoot) {
  const absolute = resolve(filePath);
  const relativePath = relative(repoRoot, absolute).split(sep).join('/');
  if (relativePath === '' || relativePath.startsWith('../') || relativePath === '..' || resolve(repoRoot, relativePath) !== absolute) {
    throw new Error(`Helper path must stay inside repository root: ${filePath}`);
  }
  return relativePath;
}

async function sha256File(filePath) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

export async function loadExternalHelperAllowlist(allowlistPath = fileURLToPath(DEFAULT_ALLOWLIST_URL)) {
  const raw = await readFile(allowlistPath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`External helper allowlist is not valid JSON: ${reason}`);
  }
  validateAllowlist(parsed, allowlistPath);
  return parsed;
}

export function validateAllowlist(allowlist, allowlistPath = 'external-helper-allowlist.json') {
  if (!allowlist || typeof allowlist !== 'object' || Array.isArray(allowlist)) {
    throw new Error(`External helper allowlist ${allowlistPath} must be a JSON object`);
  }
  if (allowlist.version !== 1) {
    throw new Error(`External helper allowlist ${allowlistPath} must use version 1`);
  }
  if (!Array.isArray(allowlist.helpers)) {
    throw new Error(`External helper allowlist ${allowlistPath} must contain helpers[]`);
  }
  const seenIds = new Set();
  const seenPaths = new Set();
  for (const helper of allowlist.helpers) {
    if (!helper || typeof helper !== 'object' || Array.isArray(helper)) {
      throw new Error('External helper allowlist entries must be objects');
    }
    if (typeof helper.id !== 'string' || !HELPER_ID_RE.test(helper.id)) {
      throw new Error(`External helper allowlist entry has invalid id: ${helper.id}`);
    }
    if (seenIds.has(helper.id)) {
      throw new Error(`External helper allowlist has duplicate helper id: ${helper.id}`);
    }
    seenIds.add(helper.id);
    if (typeof helper.path !== 'string' || helper.path.startsWith('/') || helper.path.includes('..') || helper.path.includes('\\')) {
      throw new Error(`External helper ${helper.id} has invalid repo-relative path: ${helper.path}`);
    }
    if (seenPaths.has(helper.path)) {
      throw new Error(`External helper allowlist has duplicate path: ${helper.path}`);
    }
    seenPaths.add(helper.path);
    if (helper.sha256 !== '<TO_BE_GENERATED>' && (typeof helper.sha256 !== 'string' || !SHA256_RE.test(helper.sha256))) {
      throw new Error(`External helper ${helper.id} has invalid sha256`);
    }
    if (typeof helper.owner !== 'string' || helper.owner.trim() === '') {
      throw new Error(`External helper ${helper.id} must record an owner`);
    }
    if (!Array.isArray(helper.allowedArgumentClasses) || helper.allowedArgumentClasses.length === 0) {
      throw new Error(`External helper ${helper.id} must record allowedArgumentClasses[]`);
    }
    for (const argumentClass of helper.allowedArgumentClasses) {
      if (typeof argumentClass !== 'string' || !ARG_CLASS_RE.test(argumentClass)) {
        throw new Error(`External helper ${helper.id} has invalid argument class: ${argumentClass}`);
      }
    }
  }
}

export function findAllowlistedHelper(allowlist, helperIdOrPath, repoRoot = process.cwd()) {
  const needle = String(helperIdOrPath ?? '');
  if (HELPER_ID_RE.test(needle)) {
    return allowlist.helpers.find((helper) => helper.id === needle) ?? null;
  }
  const relativePath = normalizeRepoRelativePath(needle, resolve(repoRoot));
  return allowlist.helpers.find((helper) => helper.path === relativePath) ?? null;
}

export async function verifyExternalHelperFile({ helperId, helperPath, repoRoot, allowlistPath } = {}) {
  const resolvedRepoRoot = resolve(repoRoot ?? dirname(fileURLToPath(new URL('..', DEFAULT_ALLOWLIST_URL))));
  const allowlist = await loadExternalHelperAllowlist(allowlistPath);
  const helper = findAllowlistedHelper(allowlist, helperId ?? helperPath, resolvedRepoRoot);
  if (!helper) {
    throw new Error(`External helper is not allowlisted: ${helperId ?? helperPath}`);
  }
  const absolutePath = resolve(resolvedRepoRoot, helper.path);
  const info = await stat(absolutePath).catch((error) => {
    if (error && error.code === 'ENOENT') {
      throw new Error(`Allowlisted external helper is missing: ${helper.path}`);
    }
    throw error;
  });
  if (!info.isFile()) {
    throw new Error(`Allowlisted external helper is not a regular file: ${helper.path}`);
  }
  const actualSha256 = await sha256File(absolutePath);
  if (actualSha256 !== helper.sha256) {
    throw new Error(`External helper checksum mismatch for ${helper.path}: expected ${helper.sha256}, got ${actualSha256}`);
  }
  return { helper, path: absolutePath, sha256: actualSha256 };
}

export function classifyExternalCommand(command) {
  const normalized = Array.from(command ?? [], (value) => String(value));
  return Object.entries(KNOWN_ARGUMENT_CLASS_VALIDATORS)
    .filter(([, matches]) => matches(normalized))
    .map(([argumentClass]) => argumentClass);
}

export async function verifyExternalHelperInvocation({ helperId, helperPath, command, repoRoot, allowlistPath } = {}) {
  const verification = await verifyExternalHelperFile({ helperId, helperPath, repoRoot, allowlistPath });
  const allowed = new Set(verification.helper.allowedArgumentClasses);
  const actualClasses = classifyExternalCommand(command);
  if (!actualClasses.some((argumentClass) => allowed.has(argumentClass))) {
    throw new Error(`External helper ${verification.helper.id} is not allowed to invoke command class for: ${Array.from(command ?? []).join(' ')}`);
  }
  return { ...verification, argumentClasses: actualClasses };
}
