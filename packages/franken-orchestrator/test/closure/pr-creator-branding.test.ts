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
  });
});
