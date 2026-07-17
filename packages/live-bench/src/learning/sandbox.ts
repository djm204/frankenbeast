import { createHash } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  constants,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { z } from 'zod';
import type { FixtureStore } from '../workspace/fixture-store.js';

export const DEFAULT_LEARNING_SANDBOX_TOOLS = [
  'list_fixture_files',
  'read_fixture_file',
] as const;

const MUTATION_CAPABLE_SANDBOX_TOOLS = new Set([
  'apply_patch',
  'approval_ledger_write',
  'exec_command',
  'create_issue_comment',
  'delete_file',
  'edit_file',
  'move_file',
  'rename_file',
  'remove_file',
  'uninspectable_wrapper_target',
  'github_issue_comment',
  'kanban_complete',
  'kanban_block',
  'memory',
  'patch',
  'terminal',
  'write_file',
  'write_stdin',
]);

export const LearningSandboxExperimentDeclarationSchema = z.object({
  experimentId: z.string().min(1).regex(/^[a-z0-9][a-z0-9._-]*$/),
  hypothesis: z.string().min(1),
  fixture: z.string().min(1),
  input: z.unknown(),
  expectedOutcome: z.string().min(1),
  promotionCriteria: z.array(z.string().min(1)).min(1),
  requestedTools: z.array(z.string().min(1)).default([]),
}).strict().superRefine((declaration, context) => {
  if (!Object.prototype.hasOwnProperty.call(declaration, 'input')) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['input'],
      message: 'Experiment declaration must include an explicit input field',
    });
  }
});

export const LearningSandboxPolicySchema = z.object({
  allowedTools: z.array(z.string().min(1)).default([...DEFAULT_LEARNING_SANDBOX_TOOLS]),
  readOnlyFixtureClone: z.boolean().default(true),
}).strict();

const LearningSandboxExecutionOutcomeSchema = z.object({
  passed: z.boolean(),
  evidence: z.array(z.string()),
  notes: z.string().optional(),
}).strict();

export type LearningSandboxExperimentDeclaration = z.infer<typeof LearningSandboxExperimentDeclarationSchema>;
export type LearningSandboxPolicy = z.infer<typeof LearningSandboxPolicySchema>;

export interface LearningSandboxToolCallEvidence {
  readonly tool: string;
  readonly input: unknown;
  readonly allowed: boolean;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly ok: boolean;
  readonly result?: unknown;
  readonly error?: string;
}

export interface LearningSandboxExecutionOutcome {
  readonly passed: boolean;
  readonly evidence: readonly string[];
  readonly notes?: string;
}

export interface LearningSandboxContext {
  readonly declaration: LearningSandboxExperimentDeclaration;
  readonly policy: LearningSandboxPolicy;
  readonly workspaceDir: string;
  readonly evidencePath: string;
  readonly runTool: (
    tool: string,
    input: unknown,
    handler?: () => unknown | Promise<unknown>,
  ) => Promise<unknown>;
}

export interface LearningSandboxExperimentOptions {
  readonly declaration: unknown;
  readonly fixtures: FixtureStore;
  readonly runsRoot: string;
  readonly policy?: Partial<LearningSandboxPolicy>;
  readonly execute: (context: LearningSandboxContext) => LearningSandboxExecutionOutcome | Promise<LearningSandboxExecutionOutcome>;
  readonly now?: () => string;
}

export interface LearningSandboxExperimentResult {
  readonly declaration: LearningSandboxExperimentDeclaration;
  readonly policy: LearningSandboxPolicy;
  readonly runDir: string;
  readonly workspaceDir: string;
  readonly evidencePath: string;
  readonly passed: boolean;
  readonly promotionEligible: boolean;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly outcomeEvidence: readonly string[];
  readonly notes?: string;
  readonly error?: string;
  readonly toolCalls: readonly LearningSandboxToolCallEvidence[];
  readonly blockedToolCalls: readonly LearningSandboxToolCallEvidence[];
}

export async function runLearningSandboxExperiment(
  options: LearningSandboxExperimentOptions,
): Promise<LearningSandboxExperimentResult> {
  const parsedDeclaration = LearningSandboxExperimentDeclarationSchema.parse(options.declaration) as LearningSandboxExperimentDeclaration;
  const declaration = deepFreeze(toJsonSafeEvidence(parsedDeclaration)) as LearningSandboxExperimentDeclaration;
  const enforcedPolicy = LearningSandboxPolicySchema.parse({
    ...options.policy,
    allowedTools: options.policy?.allowedTools ?? [...DEFAULT_LEARNING_SANDBOX_TOOLS],
  }) as LearningSandboxPolicy;
  const policy = freezeSandboxPolicy(enforcedPolicy);
  const now = options.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const runsRoot = resolve(options.runsRoot);
  mkdirSync(runsRoot, { recursive: true });
  const realRunsRoot = realpathSync(runsRoot);

  const fixtureDir = options.fixtures.resolveFixture(declaration.fixture);
  const sandboxRoot = resolve(realRunsRoot, 'learning-sandbox');
  ensureContained(sandboxRoot, realRunsRoot, 'sandbox run root');
  assertNoSymlinkPathComponents(sandboxRoot, realRunsRoot);
  mkdirSync(sandboxRoot, { recursive: true });
  const originalSandboxRoot = realpathSync(sandboxRoot);
  const runDir = mkdtempSync(join(sandboxRoot, `${safeRunSegment(declaration.experimentId, declaration.hypothesis)}-`));
  ensureContained(runDir, sandboxRoot, 'sandbox run directory');
  const workspaceDir = join(runDir, 'workspace');
  const evidencePath = join(runDir, 'evidence.json');

  assertNoSymlinkPathComponents(runDir, realRunsRoot);
  chmodSync(runDir, 0o700);
  const originalRunDir = realpathSync(runDir);
  mkdirSync(workspaceDir, { recursive: true, mode: 0o700 });
  cpSync(fixtureDir, workspaceDir, { recursive: true });
  assertNoSymlinksInTree(workspaceDir);
  const originalWorkspaceDir = realpathSync(workspaceDir);
  if (enforcedPolicy.readOnlyFixtureClone) {
    makeTreeReadOnly(workspaceDir);
  }
  const workspaceSnapshot = snapshotTree(workspaceDir);

  const toolCalls: LearningSandboxToolCallEvidence[] = [];
  const context: LearningSandboxContext = {
    declaration,
    policy,
    workspaceDir,
    evidencePath,
    runTool: async (tool, input, handler) => runSandboxTool({
      tool,
      input,
      handler,
      policy: enforcedPolicy,
      workspaceDir,
      originalWorkspaceDir,
      now,
      evidence: toolCalls,
    }),
  };

  let outcome: LearningSandboxExecutionOutcome = { passed: false, evidence: [] };
  let error: string | undefined;
  try {
    outcome = LearningSandboxExecutionOutcomeSchema.parse(await options.execute(context)) as LearningSandboxExecutionOutcome;
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }

  const completedAt = now();
  const postRunSnapshot = safeSnapshotTree(workspaceDir, originalWorkspaceDir);
  const workspaceMutated = enforcedPolicy.readOnlyFixtureClone && postRunSnapshot.hash !== workspaceSnapshot;
  if (postRunSnapshot.error && enforcedPolicy.readOnlyFixtureClone && error === undefined) {
    error = `Unable to verify read-only sandbox fixture clone: ${postRunSnapshot.error}`;
  } else if (workspaceMutated && error === undefined) {
    error = 'Read-only sandbox fixture clone was mutated during experiment';
  }
  const blockedToolCalls = toolCalls.filter((call) => !call.allowed);
  const passed = error === undefined && outcome.passed && blockedToolCalls.length === 0;
  const result: LearningSandboxExperimentResult = {
    declaration,
    policy,
    runDir,
    workspaceDir,
    evidencePath,
    passed,
    promotionEligible: passed && declaration.promotionCriteria.length > 0,
    startedAt,
    completedAt,
    outcomeEvidence: outcome.evidence,
    ...(outcome.notes !== undefined ? { notes: outcome.notes } : {}),
    ...(error !== undefined ? { error } : {}),
    toolCalls,
    blockedToolCalls,
  };
  writeEvidenceFileSecurely(evidencePath, `${stringifyEvidence(result)}\n`, runsRoot, realRunsRoot, runDir, originalRunDir, sandboxRoot, originalSandboxRoot);
  return result;
}

interface RunSandboxToolOptions {
  readonly tool: string;
  readonly input: unknown;
  readonly handler?: () => unknown | Promise<unknown>;
  readonly policy: LearningSandboxPolicy;
  readonly workspaceDir: string;
  readonly originalWorkspaceDir: string;
  readonly now: () => string;
  readonly evidence: LearningSandboxToolCallEvidence[];
}

async function runSandboxTool(options: RunSandboxToolOptions): Promise<unknown> {
  const startedAt = options.now();
  const mutationCapable = isMutationCapableSandboxTool(options.tool, options.input);
  const allowed = options.policy.allowedTools.includes(options.tool) && !mutationCapable;
  if (!allowed) {
    const call = {
      tool: options.tool,
      input: toJsonSafeEvidence(options.input),
      allowed: false,
      startedAt,
      completedAt: options.now(),
      ok: false,
      error: mutationCapable
        ? `Tool ${options.tool} is mutation-capable and cannot be allowed in learning sandbox policy`
        : `Tool ${options.tool} is not allowed in learning sandbox policy`,
    } satisfies LearningSandboxToolCallEvidence;
    options.evidence.push(call);
    throw new Error(call.error);
  }

  try {
    const result = await runAllowedTool(options);
    options.evidence.push({
      tool: options.tool,
      input: toJsonSafeEvidence(options.input),
      allowed: true,
      startedAt,
      completedAt: options.now(),
      ok: true,
      result: toJsonSafeEvidence(result),
    });
    return result;
  } catch (caught) {
    const error = caught instanceof Error ? caught.message : String(caught);
    options.evidence.push({
      tool: options.tool,
      input: toJsonSafeEvidence(options.input),
      allowed: true,
      startedAt,
      completedAt: options.now(),
      ok: false,
      error,
    });
    throw caught;
  }
}

async function runAllowedTool(options: RunSandboxToolOptions): Promise<unknown> {
  if (options.tool === 'list_fixture_files') {
    return listFixtureFiles(options.workspaceDir, options.originalWorkspaceDir);
  }
  if (options.tool === 'read_fixture_file') {
    return readFixtureFile(options.workspaceDir, options.originalWorkspaceDir, options.input);
  }
  if (options.handler) {
    return options.handler();
  }
  throw new Error(`Allowed sandbox tool ${options.tool} has no fixture-safe handler`);
}

function readFixtureFile(workspaceDir: string, originalWorkspaceDir: string, input: unknown): string {
  const parsed = z.object({ path: z.string().min(1) }).strict().parse(input) as { path: string };
  const path = parsed.path;
  if (path !== basename(path) && (path.startsWith('/') || path.includes('..') || path.includes('\\'))) {
    throw new Error(`Invalid fixture file path: ${path}`);
  }
  if (path.startsWith('/') || path.includes('..') || path.includes('\\')) {
    throw new Error(`Invalid fixture file path: ${path}`);
  }
  const currentWorkspaceDir = realpathSync(workspaceDir);
  if (currentWorkspaceDir !== originalWorkspaceDir || !lstatSync(workspaceDir).isDirectory()) {
    throw new Error('Sandbox fixture workspace is no longer anchored to the original clone');
  }
  const target = resolve(originalWorkspaceDir, path);
  ensureContained(target, originalWorkspaceDir, 'fixture file');
  if (!existsSync(target) || !statSync(target).isFile()) {
    throw new Error(`Fixture file not found: ${path}`);
  }
  const realTarget = realpathSync(target);
  ensureContained(realTarget, originalWorkspaceDir, 'fixture file real path');
  return readFileSync(realTarget, 'utf8');
}

function listFixtureFiles(root: string, originalWorkspaceDir: string): string[] {
  const currentWorkspaceDir = realpathSync(root);
  if (currentWorkspaceDir !== originalWorkspaceDir || !lstatSync(root).isDirectory()) {
    throw new Error('Sandbox fixture workspace is no longer anchored to the original clone');
  }
  const files: string[] = [];
  collectFixtureFiles(originalWorkspaceDir, originalWorkspaceDir, files);
  return files.sort();
}

function collectFixtureFiles(root: string, current: string, files: string[]): void {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) {
      collectFixtureFiles(root, path, files);
    } else if (entry.isFile()) {
      files.push(relative(root, path).replace(/\\/g, '/'));
    }
  }
}

function safeRunSegment(experimentId: string, hypothesis: string): string {
  const idDigest = createHash('sha256').update(experimentId).digest('hex').slice(0, 12);
  const safeIdPrefix = experimentId.slice(0, 48);
  const digest = createHash('sha256').update(hypothesis).digest('hex').slice(0, 12);
  return `${safeIdPrefix}-${idDigest}-${digest}`;
}

function ensureContained(child: string, root: string, label: string): void {
  const rel = relative(root, child);
  if (rel === '' || rel === '..' || rel.startsWith('../') || rel.startsWith('..\\') || rel.includes(':')) {
    throw new Error(`${label} escapes sandbox root: ${child}`);
  }
}

function assertNoSymlinkPathComponents(target: string, root: string): void {
  const rel = relative(root, target);
  if (rel === '' || rel === '..' || rel.startsWith('../') || rel.startsWith('..\\') || rel.includes(':')) {
    throw new Error(`sandbox run directory escapes sandbox root: ${target}`);
  }
  let current = root;
  for (const segment of rel.split(/[\\/]+/)) {
    current = join(current, segment);
    if (!existsSync(current)) {
      return;
    }
    if (lstatSync(current).isSymbolicLink()) {
      throw new Error(`Sandbox run path contains symlink component: ${current}`);
    }
    ensureContained(realpathSync(current), root, 'sandbox run directory real path');
  }
}

function assertNoSymlinksInTree(root: string): void {
  const stat = lstatSync(root);
  if (stat.isSymbolicLink()) {
    throw new Error(`Sandbox fixture clone contains symlink: ${root}`);
  }
  if (!stat.isDirectory()) {
    return;
  }
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (lstatSync(path).isSymbolicLink()) {
      throw new Error(`Sandbox fixture clone contains symlink: ${path}`);
    }
    if (entry.isDirectory()) {
      assertNoSymlinksInTree(path);
    }
  }
}

function makeTreeReadOnly(root: string): void {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      makeTreeReadOnly(path);
    } else if (entry.isFile()) {
      chmodSync(path, 0o444);
    }
  }
  chmodSync(root, 0o555);
}

function isMutationCapableSandboxTool(tool: string, input?: unknown): boolean {
  const aliases = toolAliases(tool, input);
  return aliases.some((alias) => MUTATION_CAPABLE_SANDBOX_TOOLS.has(alias)
    || alias.startsWith('fbeast_memory_')
    || alias.startsWith('fbeast_observer_')
    || alias.startsWith('fbeast_governor_')
    || alias.startsWith('fbeast_approval_')
    || alias.startsWith('github_')
    || alias.startsWith('github.')
    || alias.startsWith('kanban_')
    || alias.startsWith('kanban.'));
}

function toolAliases(tool: string, input?: unknown): string[] {
  const aliases = new Set<string>([tool]);
  const lastSegment = tool.split('.').pop();
  if (lastSegment) {
    aliases.add(lastSegment);
  }
  for (const segment of tool.split('__')) {
    if (segment) {
      aliases.add(segment);
    }
  }
  const prefixedSegments = tool.split('__');
  for (let index = 1; index < prefixedSegments.length; index += 1) {
    aliases.add(prefixedSegments.slice(index).join('_'));
  }
  if (aliases.has('execute_tool') || aliases.has('multi_tool_use.parallel') || aliases.has('parallel')) {
    for (const wrappedTool of wrappedToolNames(input)) {
      for (const alias of toolAliases(wrappedTool)) {
        aliases.add(alias);
      }
    }
  }
  return [...aliases];
}

function wrappedToolNames(input: unknown, seen = new WeakSet<object>()): string[] {
  if (!input || typeof input !== 'object') {
    return [];
  }
  if (seen.has(input)) {
    return [];
  }
  seen.add(input);
  const names: string[] = [];
  const descriptors = safeOwnPropertyDescriptors(input);
  if (descriptors['[non-json object]']) {
    names.push('uninspectable_wrapper_target');
  }
  for (const field of ['tool', 'name', 'toolName', 'tool_name', 'recipient_name']) {
    const descriptor = descriptors[field];
    if (descriptor && 'value' in descriptor && typeof descriptor.value === 'string') {
      names.push(descriptor.value);
    } else if (descriptor && !('value' in descriptor)) {
      names.push('uninspectable_wrapper_target');
    }
  }
  for (const descriptor of Object.values(descriptors)) {
    if (!('value' in descriptor)) {
      continue;
    }
    const value = descriptor.value;
    if (value && typeof value === 'object') {
      names.push(...wrappedToolNames(value, seen));
    }
  }
  seen.delete(input);
  return names;
}

function freezeSandboxPolicy(policy: LearningSandboxPolicy): LearningSandboxPolicy {
  return Object.freeze({
    ...policy,
    allowedTools: Object.freeze([...policy.allowedTools]) as unknown as string[],
  });
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (seen.has(value)) {
    return value;
  }
  seen.add(value);
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
    if ('value' in descriptor) {
      deepFreeze(descriptor.value, seen);
    }
  }
  return Object.freeze(value);
}

function snapshotTree(root: string, expectedRealRoot = realpathSync(root)): string {
  const entries: string[] = [];
  const rootStat = lstatSync(root);
  if (rootStat.isSymbolicLink()) {
    throw new Error(`Sandbox fixture clone root is a symlink: ${root}`);
  }
  const realRoot = realpathSync(root);
  if (realRoot !== expectedRealRoot) {
    throw new Error(`Sandbox fixture clone moved outside original root: ${root}`);
  }
  entries.push(`root:${rootStat.mode & 0o777}:${rootStat.ctimeMs}:${rootStat.mtimeMs}`);
  collectSnapshotEntries(root, root, entries);
  return createHash('sha256').update(entries.sort().join('\n')).digest('hex');
}

function safeSnapshotTree(root: string, expectedRealRoot?: string): { hash?: string; error?: string } {
  try {
    return { hash: snapshotTree(root, expectedRealRoot) };
  } catch (caught) {
    return { error: caught instanceof Error ? caught.message : String(caught) };
  }
}

function collectSnapshotEntries(root: string, current: string, entries: string[]): void {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    const rel = relative(root, path).replace(/\\/g, '/');
    const stat = lstatSync(path);
    if (entry.isDirectory()) {
      entries.push(`dir:${rel}:${stat.mode & 0o777}:${stat.ctimeMs}:${stat.mtimeMs}`);
      collectSnapshotEntries(root, path, entries);
    } else if (entry.isFile()) {
      entries.push(`file:${rel}:${stat.mode & 0o777}:${stat.ctimeMs}:${stat.mtimeMs}:${createHash('sha256').update(readFileSync(path)).digest('hex')}`);
    } else {
      entries.push(`other:${rel}:${stat.mode & 0o777}:${stat.ctimeMs}:${stat.mtimeMs}`);
    }
  }
}

function stringifyEvidence(value: unknown): string {
  return JSON.stringify(toJsonSafeEvidence(value), null, 2) ?? 'null';
}

function safeEnumerableEntries(value: object): Array<[string, unknown]> {
  return Object.entries(safeOwnPropertyDescriptors(value))
    .filter(([, descriptor]) => descriptor.enumerable)
    .map(([key, descriptor]) => {
      if (!('value' in descriptor)) {
        return [key, '[non-json accessor]'];
      }
      return [key, descriptor.value];
    });
}

function safeOwnPropertyDescriptors(value: object): PropertyDescriptorMap {
  try {
    return Object.getOwnPropertyDescriptors(value);
  } catch {
    return {
      '[non-json object]': {
        enumerable: true,
        configurable: true,
        value: '[non-json descriptor-trap]',
      },
    };
  }
}

function pathExistsNoFollow(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch (caught) {
    if (caught && typeof caught === 'object' && 'code' in caught && caught.code === 'ENOENT') {
      return false;
    }
    throw caught;
  }
}

function ensureRunParentAnchored(runsRoot: string, originalRunsRoot: string, sandboxRoot: string, originalSandboxRoot: string): void {
  if (!existsSync(runsRoot) || lstatSync(runsRoot).isSymbolicLink() || !lstatSync(runsRoot).isDirectory() || realpathSync(runsRoot) !== originalRunsRoot) {
    rmSync(runsRoot, { recursive: true, force: true });
    mkdirSync(runsRoot, { recursive: true, mode: 0o700 });
  }
  chmodSync(runsRoot, 0o700);
  if (!existsSync(sandboxRoot) || lstatSync(sandboxRoot).isSymbolicLink() || !lstatSync(sandboxRoot).isDirectory() || realpathSync(sandboxRoot) !== originalSandboxRoot) {
    rmSync(sandboxRoot, { recursive: true, force: true });
    mkdirSync(sandboxRoot, { recursive: true, mode: 0o700 });
  }
  chmodSync(sandboxRoot, 0o700);
}

function writeEvidenceFileSecurely(
  evidencePath: string,
  contents: string,
  runsRoot: string,
  originalRunsRoot: string,
  runDir: string,
  originalRunDir: string,
  sandboxRoot: string,
  originalSandboxRoot: string,
): void {
  const evidenceDir = dirname(evidencePath);
  if (evidenceDir !== runDir) {
    throw new Error(`Evidence path escapes sandbox run directory: ${evidencePath}`);
  }
  ensureRunParentAnchored(runsRoot, originalRunsRoot, sandboxRoot, originalSandboxRoot);
  if (!existsSync(runDir) || lstatSync(runDir).isSymbolicLink() || !lstatSync(runDir).isDirectory() || realpathSync(runDir) !== originalRunDir) {
    rmSync(runDir, { recursive: true, force: true });
    mkdirSync(runDir, { recursive: true, mode: 0o700 });
  }
  chmodSync(runDir, 0o700);
  if (pathExistsNoFollow(evidencePath)) {
    rmSync(evidencePath, { recursive: true, force: true });
  }
  const fd = openSync(evidencePath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try {
    writeFileSync(fd, contents, 'utf8');
  } finally {
    closeSync(fd);
  }
}

function toJsonSafeEvidence(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === undefined) {
    return '[non-json undefined]';
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : `[non-json number:${String(value)}]`;
  }
  if (typeof value === 'bigint') {
    return `[non-json bigint:${value.toString()}]`;
  }
  if (typeof value === 'symbol' || typeof value === 'function') {
    return `[non-json ${typeof value}]`;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '[non-json invalid-date]' : value.toISOString();
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return '[non-json circular]';
    }
    seen.add(value);
    const descriptors = safeOwnPropertyDescriptors(value);
    const items = Array.from({ length: value.length }, (_unused, index) => {
      const descriptor = descriptors[String(index)];
      if (!descriptor) {
        return '[non-json sparse-array-hole]';
      }
      if ('value' in descriptor) {
        return toJsonSafeEvidence(descriptor.value, seen);
      }
      return '[non-json accessor]';
    });
    seen.delete(value);
    return items;
  }
  if (typeof value === 'object') {
    if (seen.has(value)) {
      return '[non-json circular]';
    }
    seen.add(value);
    const entries = Object.fromEntries(safeEnumerableEntries(value).map(([key, entry]) => [key, toJsonSafeEvidence(entry, seen)]));
    seen.delete(value);
    return entries;
  }
  return String(value);
}
