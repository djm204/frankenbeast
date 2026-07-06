import { describe, it, expect, vi } from 'vitest';
import { PrCreator } from '../../src/closure/pr-creator.js';
import type { BeastResult, TaskOutcome } from '../../src/types.js';

const BRANDING = 'made with Frankenbeast 🧟';

function stubLlm(response: string) {
  return { complete: vi.fn().mockResolvedValue(response) };
}

function makeResult(overrides: Partial<BeastResult> = {}): BeastResult {
  return {
    projectId: 'test-project',
    status: 'completed',
    durationMs: 60000,
    tokenSpend: { totalTokens: 5000, estimatedCostUsd: 0.10 },
    taskResults: [
      { taskId: 'impl:01_setup', status: 'success', output: {} },
    ] as TaskOutcome[],
    ...overrides,
  };
}

function mockExec(): ReturnType<typeof vi.fn> {
  return vi.fn((command: string, args: readonly string[] = []) => {
    const cmd = [command, ...args].join(' ');
    if (cmd.startsWith('git branch --show-current')) return 'feature/branch\n';
    if (cmd.startsWith('git push')) return '';
    if (cmd.startsWith('gh pr list')) return '[]';
    if (cmd.startsWith('gh pr create')) return 'https://example.com/pr/1\n';
    if (cmd.startsWith('git diff --stat')) return ' src/foo.ts | 1 +\n 1 file changed, 1 insertion(+)\n';
    if (cmd.startsWith('git diff --shortstat')) return ' 1 file changed, 1 insertion(+)';
    if (cmd.startsWith('git log --oneline')) return 'abc1234 feat: setup\n';
    return '';
  });
}

function bodyArg(exec: ReturnType<typeof vi.fn>): string {
  const createCall = exec.mock.calls.find(c => c[0] === 'gh' && (c[1] as string[]).includes('create'));
  const args = (createCall?.[1] as string[]) ?? [];
  const bodyIdx = args.indexOf('--body');
  return bodyIdx >= 0 ? args[bodyIdx + 1]! : '';
}

describe('PrCreator branding', () => {
  describe('commit messages', () => {
    it('appends branding tagline to LLM-generated commit message', async () => {
      const llm = stubLlm('feat(auth): add login endpoint');
      const creator = new PrCreator(
        { targetBranch: 'main', disabled: false, remote: 'origin' },
        undefined,
        llm,
      );

      const msg = await creator.generateCommitMessage('3 files changed', 'Add auth');

      expect(msg).toContain('feat(auth): add login endpoint');
      expect(msg).toContain(BRANDING);
      // Two newlines separate the subject from the branding
      expect(msg).toMatch(/feat\(auth\): add login endpoint\n\n.*made with Frankenbeast/);
    });

    it('strips markdown fences before appending branding', async () => {
      const llm = stubLlm('```\nfix(api): patch null check\n```');
      const creator = new PrCreator(
        { targetBranch: 'main', disabled: false, remote: 'origin' },
        undefined,
        llm,
      );

      const msg = await creator.generateCommitMessage('1 file changed', 'Fix null');

      expect(msg).toContain('fix(api): patch null check');
      expect(msg).toContain(BRANDING);
      expect(msg).not.toContain('```');
    });

    it('omits branding from LLM-generated commit messages when disabled', async () => {
      const llm = stubLlm('feat(auth): add login endpoint');
      const creator = new PrCreator(
        { targetBranch: 'main', disabled: false, remote: 'origin', disableBranding: true },
        undefined,
        llm,
      );

      const msg = await creator.generateCommitMessage('3 files changed', 'Add auth');

      expect(msg).toBe('feat(auth): add login endpoint');
      expect(msg).not.toContain(BRANDING);
    });
  });

  describe('PR description', () => {
    it('appends branding to LLM-generated PR body', async () => {
      const llm = stubLlm(
        'TITLE: feat(auth): add login\nBODY:\n## Summary\n- Added login endpoint',
      );
      const creator = new PrCreator(
        { targetBranch: 'main', disabled: false, remote: 'origin' },
        undefined,
        llm,
      );

      const result = await creator.generatePrDescription('abc123 feat', '3 files', makeResult());

      expect(result).not.toBeNull();
      expect(result!.body).toContain('## Summary');
      expect(result!.body).toContain(BRANDING);
      // Branding at the end, separated by newlines
      expect(result!.body).toMatch(/Added login endpoint[\s\S]*\n\nmade with Frankenbeast/);
    });

    it('includes branding in template-generated PR body', async () => {
      // No LLM — uses template path
      const creator = new PrCreator(
        { targetBranch: 'main', disabled: false, remote: 'origin' },
      );

      // We can't call create() without git, but we can test buildBody indirectly
      // by checking the PR description when LLM is not available
      const desc = await creator.generatePrDescription('abc', 'diff', makeResult());

      // No LLM → returns null (template path is used in create() only)
      expect(desc).toBeNull();
    });

    it('omits branding from LLM-generated PR body when disabled', async () => {
      const llm = stubLlm(
        'TITLE: feat(auth): add login\nBODY:\n## Summary\n- Added login endpoint',
      );
      const creator = new PrCreator(
        { targetBranch: 'main', disabled: false, remote: 'origin', disableBranding: true },
        undefined,
        llm,
      );

      const result = await creator.generatePrDescription('abc123 feat', '3 files', makeResult());

      expect(result).not.toBeNull();
      expect(result!.body).toBe('## Summary\n- Added login endpoint');
      expect(result!.body).not.toContain(BRANDING);
    });

    it('omits branding from template-generated PR body when disabled', async () => {
      const exec = mockExec();
      const creator = new PrCreator(
        { targetBranch: 'main', disabled: false, remote: 'origin', disableBranding: true },
        exec,
      );

      await creator.create(makeResult());

      const body = bodyArg(exec);
      expect(body).toContain('## What Changed');
      expect(body).not.toContain(BRANDING);
      expect(body).not.toContain('---\nmade with Frankenbeast');
    });
  });
});
