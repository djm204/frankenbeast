import { createHash } from 'node:crypto';
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
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

export const LearningSandboxExperimentDeclarationSchema = z.object({
  experimentId: z.string().min(1).regex(/^[a-z0-9][a-z0-9._-]*$/),
  hypothesis: z.string().min(1),
  fixture: z.string().min(1),
  input: z.unknown(),
  expectedOutcome: z.string().min(1),
  promotionCriteria: z.array(z.string().min(1)).min(1),
  requestedTools: z.array(z.string().min(1)).default([]),
}).strict();

export const LearningSandboxPolicySchema = z.object({
  allowedTools: z.array(z.string().min(1)).default([...DEFAULT_LEARNING_SANDBOX_TOOLS]),
  readOnlyFixtureClone: z.boolean().default(true),
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
  const declaration = LearningSandboxExperimentDeclarationSchema.parse(options.declaration) as LearningSandboxExperimentDeclaration;
  const policy = LearningSandboxPolicySchema.parse({
    ...options.policy,
    allowedTools: options.policy?.allowedTools ?? [...DEFAULT_LEARNING_SANDBOX_TOOLS],
  }) as LearningSandboxPolicy;
  const now = options.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const runsRoot = resolve(options.runsRoot);
  mkdirSync(runsRoot, { recursive: true });

  const fixtureDir = options.fixtures.resolveFixture(declaration.fixture);
  const runDir = resolve(runsRoot, 'learning-sandbox', safeRunSegment(declaration.experimentId, declaration.hypothesis));
  ensureContained(runDir, runsRoot, 'sandbox run directory');
  const workspaceDir = join(runDir, 'workspace');
  const evidencePath = join(runDir, 'evidence.json');

  rmSync(runDir, { recursive: true, force: true });
  mkdirSync(workspaceDir, { recursive: true });
  cpSync(fixtureDir, workspaceDir, { recursive: true });
  assertNoSymlinksInTree(workspaceDir);
  if (policy.readOnlyFixtureClone) {
    makeTreeReadOnly(workspaceDir);
  }

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
      policy,
      workspaceDir,
      now,
      evidence: toolCalls,
    }),
  };

  let outcome: LearningSandboxExecutionOutcome = { passed: false, evidence: [] };
  let error: string | undefined;
  try {
    outcome = await options.execute(context);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }

  const completedAt = now();
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
    notes: outcome.notes,
    error,
    toolCalls,
    blockedToolCalls,
  };
  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return result;
}

interface RunSandboxToolOptions {
  readonly tool: string;
  readonly input: unknown;
  readonly handler?: () => unknown | Promise<unknown>;
  readonly policy: LearningSandboxPolicy;
  readonly workspaceDir: string;
  readonly now: () => string;
  readonly evidence: LearningSandboxToolCallEvidence[];
}

async function runSandboxTool(options: RunSandboxToolOptions): Promise<unknown> {
  const startedAt = options.now();
  const allowed = options.policy.allowedTools.includes(options.tool);
  if (!allowed) {
    const call = {
      tool: options.tool,
      input: options.input,
      allowed: false,
      startedAt,
      completedAt: options.now(),
      ok: false,
      error: `Tool ${options.tool} is not allowed in learning sandbox policy`,
    } satisfies LearningSandboxToolCallEvidence;
    options.evidence.push(call);
    throw new Error(call.error);
  }

  try {
    const result = await runAllowedTool(options);
    options.evidence.push({
      tool: options.tool,
      input: options.input,
      allowed: true,
      startedAt,
      completedAt: options.now(),
      ok: true,
      result,
    });
    return result;
  } catch (caught) {
    const error = caught instanceof Error ? caught.message : String(caught);
    options.evidence.push({
      tool: options.tool,
      input: options.input,
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
    return listFixtureFiles(options.workspaceDir);
  }
  if (options.tool === 'read_fixture_file') {
    return readFixtureFile(options.workspaceDir, options.input);
  }
  if (options.handler) {
    return options.handler();
  }
  throw new Error(`Allowed sandbox tool ${options.tool} has no fixture-safe handler`);
}

function readFixtureFile(workspaceDir: string, input: unknown): string {
  const parsed = z.object({ path: z.string().min(1) }).strict().parse(input) as { path: string };
  const path = parsed.path;
  if (path !== basename(path) && (path.startsWith('/') || path.includes('..') || path.includes('\\'))) {
    throw new Error(`Invalid fixture file path: ${path}`);
  }
  if (path.startsWith('/') || path.includes('..') || path.includes('\\')) {
    throw new Error(`Invalid fixture file path: ${path}`);
  }
  const target = resolve(workspaceDir, path);
  ensureContained(target, workspaceDir, 'fixture file');
  if (!existsSync(target) || !statSync(target).isFile()) {
    throw new Error(`Fixture file not found: ${path}`);
  }
  const realTarget = realpathSync(target);
  ensureContained(realTarget, realpathSync(workspaceDir), 'fixture file real path');
  return readFileSync(realTarget, 'utf8');
}

function listFixtureFiles(root: string): string[] {
  const files: string[] = [];
  collectFixtureFiles(root, root, files);
  return files.sort();
}

function collectFixtureFiles(root: string, current: string, files: string[]): void {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) {
      collectFixtureFiles(root, path, files);
    } else if (entry.isFile()) {
      files.push(relative(root, path));
    }
  }
}

function safeRunSegment(experimentId: string, hypothesis: string): string {
  const digest = createHash('sha256').update(hypothesis).digest('hex').slice(0, 12);
  return `${experimentId}-${digest}`;
}

function ensureContained(child: string, root: string, label: string): void {
  const rel = relative(root, child);
  if (rel === '' || rel === '..' || rel.startsWith('../') || rel.startsWith('..\\') || rel.includes(':')) {
    throw new Error(`${label} escapes sandbox root: ${child}`);
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
