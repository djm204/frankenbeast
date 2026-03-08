import { execSync } from 'node:child_process';
import type { InterviewIO } from '../planning/interview-loop.js';

/**
 * Detects the current git branch.
 * Returns undefined if not in a git repo.
 */
export function detectCurrentBranch(workingDir: string): string | undefined {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: workingDir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return undefined;
  }
}

/**
 * Resolves the base branch to use for git isolation.
 *
 * 1. If --base-branch flag provided, use it (no prompt).
 * 2. If current branch is 'main' or 'master', use it silently.
 * 3. Otherwise, prompt user for confirmation.
 */
export async function resolveBaseBranch(
  workingDir: string,
  cliOverride: string | undefined,
  io: InterviewIO,
): Promise<string> {
  if (cliOverride) {
    return cliOverride;
  }

  const current = detectCurrentBranch(workingDir);
  if (!current) {
    io.display('Warning: Not in a git repository. Defaulting base branch to "main".');
    return 'main';
  }

  if (current === 'main' || current === 'master') {
    return current;
  }

  const answer = await io.ask(
    `You're on branch "${current}". Are you sure you want to target this as your base branch? (y/n)`,
  );
  const normalized = answer.trim().toLowerCase();
  if (normalized === 'y' || normalized === 'yes') {
    return current;
  }

  return 'main';
}
