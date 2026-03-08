import { execSync } from 'node:child_process';
import type { ILlmClient } from '@franken/types';
import type { BeastResult, TaskOutcome } from '../types.js';
import type { ILogger } from '../deps.js';

export interface PrCreatorConfig {
  readonly targetBranch: string;
  readonly disabled: boolean;
  readonly remote: string;
}

export interface PrCreateOptions {
  readonly issueNumber?: number | undefined;
}

type ExecFn = (cmd: string) => string;

const defaultExec: ExecFn = (cmd: string) => execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' });

export class PrCreator {
  private readonly config: PrCreatorConfig;
  private readonly exec: ExecFn;
  private readonly llm?: ILlmClient | undefined;

  constructor(config: PrCreatorConfig, exec: ExecFn = defaultExec, llm?: ILlmClient) {
    this.config = {
      targetBranch: config.targetBranch ?? 'main',
      disabled: config.disabled ?? false,
      remote: config.remote ?? 'origin',
    };
    this.exec = exec;
    this.llm = llm;
  }

  async generateCommitMessage(diffStat: string, chunkObjective: string): Promise<string | null> {
    if (!this.llm) return null;
    try {
      const prompt = [
        'Write a semver-compatible conventional commit message for this change.',
        'Format: type(scope): description',
        'Types: feat, fix, chore, refactor, docs, test, ci, perf',
        'One line, max 72 chars. No markdown, no backticks.',
        'The type determines semver bump: feat = minor, fix = patch, BREAKING CHANGE footer = major.',
        '',
        `Chunk objective: ${chunkObjective}`,
        'Files changed:',
        diffStat,
      ].join('\n');

      const raw = await this.llm.complete(prompt);
      const msg = cleanCommitMessage(raw);
      const subject = msg.split('\n')[0] ?? '';
      if (!CONVENTIONAL_SUBJECT_RE.test(subject)) {
        return buildFallbackCommitMessage(chunkObjective);
      }
      return msg;
    } catch {
      return null;
    }
  }

  async generatePrDescription(
    commitLog: string,
    diffStat: string,
    result: BeastResult,
    issueNumber?: number,
  ): Promise<{ title: string; body: string } | null> {
    if (!this.llm) return null;
    try {
      const promptLines = [
        'Write a GitHub PR title and body for these changes.',
        'Title: max 70 chars, semver-compatible conventional commit style (e.g. feat(module): description).',
        'Body: markdown with ## Summary (2-4 bullets) and ## Changes (key files).',
        '',
        'Commits:',
        commitLog,
        '',
        'Files changed:',
        diffStat,
        '',
        `Project: ${result.projectId}`,
        `Chunks completed: ${result.taskResults?.length ?? 0}`,
      ];

      if (issueNumber != null) {
        promptLines.push(`This PR fixes GitHub issue #${issueNumber}.`);
      }

      promptLines.push(
        '',
        'Respond in this exact format:',
        'TITLE: <title here>',
        'BODY:',
        '<body here>',
      );

      const prompt = promptLines.join('\n');

      const raw = await this.llm.complete(prompt);
      return parsePrDescription(raw);
    } catch {
      return null;
    }
  }

  async create(result: BeastResult, logger?: ILogger, options?: PrCreateOptions): Promise<{ url: string } | null> {
    if (this.config.disabled) {
      logger?.warn('PrCreator: skipped (disabled)');
      return null;
    }

    const outcomes = result.taskResults ?? [];
    const allSucceeded = outcomes.length > 0 && outcomes.every(o => o.status === 'success');
    if (result.status !== 'completed' || !allSucceeded) {
      logger?.warn('PrCreator: skipped (not all tasks completed)', {
        status: result.status,
        total: outcomes.length,
        succeeded: outcomes.filter(o => o.status === 'success').length,
      });
      return null;
    }

    const branch = this.safeExec('git branch --show-current', logger)?.trim() ?? '';
    if (!branch) {
      logger?.error('PrCreator: unable to resolve current branch');
      return null;
    }

    let targetBranch = this.config.targetBranch;
    if (branch === targetBranch) {
      if (targetBranch === 'main') {
        logger?.warn('PrCreator: skipped — current branch is main, cannot PR main to main', { branch });
        return null;
      }
      logger?.info('PrCreator: current branch equals base-branch, targeting main instead', {
        branch, originalTarget: targetBranch,
      });
      targetBranch = 'main';
    }

    if (!this.pushBranch(branch, logger)) {
      return null;
    }

    const existing = this.findExistingPr(branch, logger);
    if (existing === null) {
      return null;
    }
    if (existing.length > 0) {
      logger?.info('PrCreator: PR already exists', { branch, url: existing[0]?.url });
      return null;
    }

    // Gather git context for PR description
    const gitContext = this.gatherGitContext(targetBranch, logger);

    // Try LLM-generated PR description first, fall back to template
    let title: string;
    let body: string;

    const llmResult = await this.tryGeneratePrFromLlm(result, logger, options?.issueNumber);
    if (llmResult) {
      title = llmResult.title;
      body = llmResult.body;
    } else {
      title = buildTitle(result.projectId, outcomes);
      body = buildBody(result, outcomes, gitContext);
    }

    // Append issue reference if provided and not already present
    if (options?.issueNumber != null) {
      body = appendIssueRef(body, options.issueNumber);
    }

    try {
      const output = this.exec(
        `gh pr create --base ${targetBranch} --title ${shellEscape(title)} --body ${shellEscape(body)}`,
      );
      const url = output.trim();
      if (!url) {
        logger?.warn('PrCreator: PR created but no URL returned');
        return null;
      }
      logger?.info('PrCreator: PR created', { url });
      return { url };
    } catch (error) {
      if (isGhMissing(error)) {
        logger?.warn('PrCreator: gh CLI not installed');
        return null;
      }
      logger?.error('PrCreator: failed to create PR', { error: stringifyError(error) });
      return null;
    }
  }

  private safeExec(cmd: string, logger?: ILogger): string | null {
    try {
      return this.exec(cmd);
    } catch (error) {
      logger?.error('PrCreator: command failed', { cmd, error: stringifyError(error) });
      return null;
    }
  }

  private pushBranch(branch: string, logger?: ILogger): boolean {
    try {
      this.exec(`git push ${this.config.remote} ${branch}`);
      return true;
    } catch (error) {
      logger?.error('PrCreator: failed to push branch', { branch, error: stringifyError(error) });
      return false;
    }
  }

  private findExistingPr(branch: string, logger?: ILogger): Array<{ url?: string }> | null {
    try {
      const output = this.exec(`gh pr list --head ${branch} --json url --limit 1`);
      const parsed = JSON.parse(output) as Array<{ url?: string }>;
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      if (isGhMissing(error)) {
        logger?.warn('PrCreator: gh CLI not installed');
        return null;
      }
      logger?.error('PrCreator: failed to list PRs', { error: stringifyError(error) });
      return null;
    }
  }

  private async tryGeneratePrFromLlm(
    result: BeastResult,
    logger?: ILogger,
    issueNumber?: number,
  ): Promise<{ title: string; body: string } | null> {
    if (!this.llm) return null;
    try {
      const commitLog = this.safeExec(
        `git log ${this.config.targetBranch}..HEAD --oneline`,
        logger,
      ) ?? '';
      const diffStat = this.safeExec(
        `git diff --stat ${this.config.targetBranch}..HEAD`,
        logger,
      ) ?? '';
      return await this.generatePrDescription(commitLog, diffStat, result, issueNumber);
    } catch {
      return null;
    }
  }

  private gatherGitContext(targetBranch: string, logger?: ILogger): GitContext {
    const diffStat = this.safeExec(`git diff --stat ${targetBranch}...HEAD`, logger) ?? '';
    const logOutput = this.safeExec(
      `git log --oneline ${targetBranch}...HEAD`,
      logger,
    ) ?? '';
    const shortstat = this.safeExec(`git diff --shortstat ${targetBranch}...HEAD`, logger) ?? '';

    return { diffStat, logOutput, shortstat: shortstat.trim() };
  }
}

interface GitContext {
  readonly diffStat: string;
  readonly logOutput: string;
  readonly shortstat: string;
}

function buildTitle(projectId: string, outcomes: readonly TaskOutcome[]): string {
  // Extract unique chunk names (strip impl:/harden: prefixes, deduplicate)
  const chunkNames = [...new Set(
    outcomes.map(o => o.taskId.replace(/^(impl|harden):/, '')),
  )];

  const prefix = 'feat: ';
  const maxLength = 70;

  // Try to build a descriptive title from chunk names
  if (chunkNames.length <= 3) {
    const joined = chunkNames.join(', ');
    const title = `${prefix}${joined}`;
    if (title.length <= maxLength) return title;
  }

  // Fall back to count-based title
  const suffix = ` (${chunkNames.length} chunks)`;
  const available = maxLength - prefix.length - suffix.length;
  const trimmedProject = available > 0
    ? (projectId.length > available ? `${projectId.slice(0, Math.max(available - 3, 0))}...` : projectId)
    : projectId.slice(0, Math.max(maxLength - 3, 0)) + '...';
  const title = `${prefix}${trimmedProject}${suffix}`;
  return title.length > maxLength ? title.slice(0, maxLength - 3) + '...' : title;
}

function buildBody(
  result: BeastResult,
  outcomes: readonly TaskOutcome[],
  gitContext?: GitContext,
): string {
  const succeeded = outcomes.filter(o => o.status === 'success').length;
  const failed = outcomes.filter(o => o.status === 'failure').length;
  const skipped = outcomes.filter(o => o.status === 'skipped').length;

  const lines: string[] = [];

  // -- What Changed --
  lines.push('## What Changed');
  const chunkDescriptions = buildChunkDescriptions(outcomes, gitContext);
  if (chunkDescriptions.length > 0) {
    for (const desc of chunkDescriptions) {
      lines.push(`- ${desc}`);
    }
  } else {
    lines.push(`- ${succeeded} tasks completed across ${result.projectId}`);
  }
  lines.push('');

  // -- Stats --
  lines.push('## Stats');
  lines.push(`- **Status**: ${result.status}`);
  lines.push(`- **Tasks**: ${succeeded}/${outcomes.length} succeeded`
    + (failed > 0 ? `, ${failed} failed` : '')
    + (skipped > 0 ? `, ${skipped} skipped` : ''));
  if (result.durationMs > 0) {
    lines.push(`- **Duration**: ${formatDuration(result.durationMs)}`);
  }
  if (result.tokenSpend.estimatedCostUsd > 0) {
    lines.push(`- **Estimated Cost**: $${result.tokenSpend.estimatedCostUsd.toFixed(2)}`);
  }
  if (result.tokenSpend.totalTokens > 0) {
    lines.push(`- **Tokens**: ${formatTokenCount(result.tokenSpend.totalTokens)}`);
  }
  lines.push('');

  // -- Files Changed --
  if (gitContext?.shortstat) {
    lines.push('## Files Changed');
    lines.push(`\`${gitContext.shortstat}\``);
    lines.push('');

    // Show file-level diff stat (truncated for large PRs)
    if (gitContext.diffStat) {
      const statLines = gitContext.diffStat.split('\n').filter(l => l.trim());
      // Remove the summary line (last line duplicates shortstat)
      const fileLines = statLines.slice(0, -1);
      if (fileLines.length > 0) {
        const shown = fileLines.slice(0, 30);
        lines.push('<details>');
        lines.push(`<summary>${fileLines.length} files</summary>`);
        lines.push('');
        lines.push('```');
        for (const line of shown) {
          lines.push(line);
        }
        if (fileLines.length > 30) {
          lines.push(`... and ${fileLines.length - 30} more files`);
        }
        lines.push('```');
        lines.push('</details>');
        lines.push('');
      }
    }
  }

  // -- Task Details --
  lines.push('<details>');
  lines.push('<summary>Task Details</summary>');
  lines.push('');
  lines.push('| Task | Status | Iterations |');
  lines.push('| --- | --- | --- |');
  for (const outcome of outcomes) {
    const statusIcon = outcome.status === 'success' ? 'pass' : outcome.status === 'failure' ? 'FAIL' : 'skip';
    lines.push(`| ${outcome.taskId} | ${statusIcon} | ${formatIterations(outcome)} |`);
  }
  lines.push('');
  lines.push('</details>');
  lines.push('');

  // -- Commit Log --
  if (gitContext?.logOutput) {
    const commits = gitContext.logOutput.split('\n').filter(l => l.trim());
    if (commits.length > 0) {
      lines.push('<details>');
      lines.push(`<summary>Commit Log (${commits.length} commits)</summary>`);
      lines.push('');
      const shown = commits.slice(0, 50);
      for (const commit of shown) {
        lines.push(`- \`${commit.trim()}\``);
      }
      if (commits.length > 50) {
        lines.push(`- ... and ${commits.length - 50} more`);
      }
      lines.push('');
      lines.push('</details>');
      lines.push('');
    }
  }

  lines.push('---');
  lines.push(BRANDING);

  return lines.join('\n');
}

function buildChunkDescriptions(
  outcomes: readonly TaskOutcome[],
  gitContext?: GitContext,
): string[] {
  // Group outcomes by chunk name (strip impl:/harden: prefix)
  const chunkMap = new Map<string, { impl: boolean; harden: boolean; iterations: number }>();
  for (const o of outcomes) {
    const isImpl = o.taskId.startsWith('impl:');
    const isHarden = o.taskId.startsWith('harden:');
    const name = o.taskId.replace(/^(impl|harden):/, '');

    const entry = chunkMap.get(name) ?? { impl: false, harden: false, iterations: 0 };
    if (isImpl) entry.impl = o.status === 'success';
    if (isHarden) entry.harden = o.status === 'success';
    entry.iterations += getIterationCount(o);
    chunkMap.set(name, entry);
  }

  // Count commits per chunk from git log
  const commitCounts = new Map<string, number>();
  if (gitContext?.logOutput) {
    for (const line of gitContext.logOutput.split('\n')) {
      for (const [chunkName] of chunkMap) {
        if (line.includes(chunkName)) {
          commitCounts.set(chunkName, (commitCounts.get(chunkName) ?? 0) + 1);
        }
      }
    }
  }

  const descriptions: string[] = [];
  for (const [name, info] of chunkMap) {
    const humanName = name.replace(/_/g, ' ').replace(/^\d+\s*/, '');
    const stages: string[] = [];
    if (info.impl) stages.push('implemented');
    if (info.harden) stages.push('hardened');
    const stageStr = stages.length > 0 ? stages.join(' + ') : 'processed';

    const commits = commitCounts.get(name);
    const commitStr = commits ? ` (${commits} commit${commits !== 1 ? 's' : ''})` : '';

    descriptions.push(`**${humanName}**: ${stageStr}${commitStr}`);
  }

  return descriptions;
}

function getIterationCount(outcome: TaskOutcome): number {
  const output = outcome.output as { iterations?: unknown } | undefined;
  if (output && typeof output === 'object' && typeof output.iterations === 'number') {
    return output.iterations;
  }
  return 0;
}

function formatIterations(outcome: TaskOutcome): string {
  const count = getIterationCount(outcome);
  return count > 0 ? String(count) : '-';
}

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  if (minutes < 60) return `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function formatTokenCount(tokens: number): string {
  if (tokens < 1000) return String(tokens);
  if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)}k`;
  return `${(tokens / 1_000_000).toFixed(2)}M`;
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function isGhMissing(error: unknown): boolean {
  const message = stringifyError(error);
  return message.includes('gh: command not found') || message.includes('ENOENT') || message.includes('not found');
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function parsePrDescription(raw: string): { title: string; body: string } | null {
  const titleMatch = raw.match(/^TITLE:\s*(.+)$/m);
  const bodyMatch = raw.match(/^BODY:\s*\n?([\s\S]+)$/m);
  if (!titleMatch || !bodyMatch) return null;

  let title = titleMatch[1]!.trim();
  if (title.length > 70) title = title.slice(0, 70);
  const body = bodyMatch[1]!.trim();
  if (!body) return null;

  return { title, body: `${body}\n\n${BRANDING}` };
}

const BRANDING = 'made with Frankenbeast 🧟';

/** Matches a valid conventional commit subject: type(scope): description */
const CONVENTIONAL_SUBJECT_RE = /^[a-z]+(\([^)]+\))?: \S/;

function buildFallbackCommitMessage(chunkObjective: string): string {
  const slug = chunkObjective.trim().slice(0, 50).replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '').replace(/-{2,}/g, '-').replace(/^-|-$/g, '').toLowerCase();
  return `chore: implement ${slug || 'changes'}\n\n${BRANDING}`;
}

function appendIssueRef(body: string, issueNumber: number): string {
  const ref = `Fixes #${issueNumber}`;
  // Check if the body already contains this exact issue reference
  if (body.includes(ref)) return body;
  return `${body}\n\nFixes #${issueNumber}`;
}

function cleanCommitMessage(raw: string): string {
  let msg = raw.trim();
  // Strip markdown code fences
  msg = msg.replace(/^```[^\n]*\n?/, '').replace(/\n?```\s*$/, '').trim();
  // Take first non-empty line only
  const firstLine = msg.split('\n').find(l => l.trim().length > 0) ?? msg;
  // Truncate to 72 chars
  const subject = firstLine.length > 72 ? firstLine.slice(0, 72) : firstLine;
  return `${subject}\n\n${BRANDING}`;
}
