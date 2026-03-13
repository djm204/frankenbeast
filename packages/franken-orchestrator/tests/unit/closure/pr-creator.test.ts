import { describe, it, expect, vi } from 'vitest';
import { PrCreator } from '../../../src/closure/pr-creator.js';
import type { BeastResult, TaskOutcome } from '../../../src/types.js';

const baseResult: BeastResult = {
  sessionId: 'issue-42',
  projectId: 'proj-123',
  phase: 'closure',
  status: 'completed',
  tokenSpend: {
    inputTokens: 1000,
    outputTokens: 2000,
    totalTokens: 3000,
    estimatedCostUsd: 0.45,
  },
  taskResults: [
    { taskId: 'impl:01_fix_auth', status: 'success' },
  ],
  durationMs: 60_000,
};

function makeLogger() {
  return {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function mockExec(overrides?: Partial<Record<string, string | Error>>): ReturnType<typeof vi.fn> {
  return vi.fn((cmd: string) => {
    for (const [prefix, value] of Object.entries(overrides ?? {})) {
      if (cmd.startsWith(prefix)) {
        if (value instanceof Error) throw value;
        return value;
      }
    }
    if (cmd.startsWith('git branch --show-current')) return 'fix/issue-42\n';
    if (cmd.startsWith('git push')) return '';
    if (cmd.startsWith('gh pr list')) return '[]';
    if (cmd.startsWith('gh pr create')) return 'https://example.com/pr/42\n';
    if (cmd.startsWith('git diff --stat')) return ' src/auth.ts | 10 ++++\n 1 file changed, 10 insertions(+)\n';
    if (cmd.startsWith('git diff --shortstat')) return ' 1 file changed, 10 insertions(+)';
    if (cmd.startsWith('git log --oneline')) return 'abc1234 fix(auth): patch null check\n';
    return '';
  });
}

describe('generateCommitMessage — fallback on garbage', () => {
  it('returns canned chore: message when LLM returns raw stream-json', async () => {
    const llm = {
      complete: vi.fn().mockResolvedValue(
        '{"type":"thread.started","thread_id":"019ccc41-a358"}\n{"type":"message_stop"}',
      ),
    };
    const creator = new PrCreator(
      { targetBranch: 'main', disabled: false, remote: 'origin' },
      vi.fn(),
      llm,
    );

    const result = await creator.generateCommitMessage(
      ' src/auth.ts | 10 ++++',
      'fix authentication null check',
    );

    expect(result).toBeTruthy();
    expect(result!).toMatch(/^(feat|fix|chore|refactor|docs|test|ci|perf)/);
    expect(result!).not.toContain('"type"');
    expect(result!).not.toContain('thread.started');
  });

  it('returns canned message when LLM returns non-conventional text', async () => {
    const llm = {
      complete: vi.fn().mockResolvedValue(
        'Sure! Here is your commit message: feat(auth): fix stuff',
      ),
    };
    const creator = new PrCreator(
      { targetBranch: 'main', disabled: false, remote: 'origin' },
      vi.fn(),
      llm,
    );

    const result = await creator.generateCommitMessage(
      ' src/auth.ts | 10 ++++',
      'fix authentication null check',
    );

    expect(result).toBeTruthy();
    expect(result!).toMatch(/^(feat|fix|chore|refactor|docs|test|ci|perf)/);
    // Should NOT start with "Sure!"
    expect(result!).not.toMatch(/^Sure/);
  });

  it('passes through valid conventional commit messages unchanged', async () => {
    const llm = {
      complete: vi.fn().mockResolvedValue('feat(auth): add session validation'),
    };
    const creator = new PrCreator(
      { targetBranch: 'main', disabled: false, remote: 'origin' },
      vi.fn(),
      llm,
    );

    const result = await creator.generateCommitMessage(
      ' src/auth.ts | 10 ++++',
      'add session validation',
    );

    expect(result).toBeTruthy();
    expect(result!).toContain('feat(auth): add session validation');
  });

  it('extracts valid commit from language-tagged code fence', async () => {
    const llm = {
      complete: vi.fn().mockResolvedValue(
        '```text\nfeat(auth): add session validation\n```',
      ),
    };
    const creator = new PrCreator(
      { targetBranch: 'main', disabled: false, remote: 'origin' },
      vi.fn(),
      llm,
    );

    const result = await creator.generateCommitMessage(
      ' src/auth.ts | 10 ++++',
      'add session validation',
    );

    expect(result).toBeTruthy();
    expect(result!).toContain('feat(auth): add session validation');
  });

  it('produces clean slug without leading/trailing/double hyphens', async () => {
    const llm = { complete: vi.fn().mockResolvedValue('') };
    const creator = new PrCreator(
      { targetBranch: 'main', disabled: false, remote: 'origin' },
      vi.fn(),
      llm,
    );

    const result = await creator.generateCommitMessage(
      ' src/auth.ts | 10 ++++',
      '! fix @auth/core -- issue !',
    );

    expect(result).toBeTruthy();
    // Should not have leading/trailing/double hyphens in the slug
    expect(result!).toMatch(/^chore: implement [a-z0-9]/);
    expect(result!).not.toMatch(/^chore: implement -/);
    expect(result!).not.toMatch(/--/);
  });

  it('returns canned message when LLM returns empty string', async () => {
    const llm = { complete: vi.fn().mockResolvedValue('') };
    const creator = new PrCreator(
      { targetBranch: 'main', disabled: false, remote: 'origin' },
      vi.fn(),
      llm,
    );

    const result = await creator.generateCommitMessage(
      ' src/auth.ts | 10 ++++',
      'fix auth bug',
    );

    expect(result).toBeTruthy();
    expect(result!).toMatch(/^chore: implement/);
  });
});

describe('PrCreator issue reference integration', () => {
  describe('create() with issueNumber', () => {
    it('includes Fixes #N in PR body when issueNumber is provided (template path)', async () => {
      const exec = mockExec();
      const creator = new PrCreator({ targetBranch: 'main', disabled: false, remote: 'origin' }, exec);

      await creator.create(baseResult, makeLogger(), { issueNumber: 42 });

      const createCmd = exec.mock.calls.find((c: string[]) => c[0].startsWith('gh pr create'))?.[0] ?? '';
      expect(createCmd).toContain('Fixes #42');
    });

    it('places Fixes #N on its own line', async () => {
      const exec = mockExec();
      const creator = new PrCreator({ targetBranch: 'main', disabled: false, remote: 'origin' }, exec);

      await creator.create(baseResult, makeLogger(), { issueNumber: 42 });

      const createCmd = exec.mock.calls.find((c: string[]) => c[0].startsWith('gh pr create'))?.[0] ?? '';
      // Extract the body from the gh pr create command
      const bodyMatch = createCmd.match(/--body\s+'([\s\S]*?)'\s*$/);
      expect(bodyMatch).toBeTruthy();
      const body = bodyMatch![1] as string;
      // Fixes #42 must appear on its own line (preceded by newline or start of string)
      expect(body).toMatch(/(?:^|\n)Fixes #42(?:\n|$)/);
    });

    it('does not include Fixes #N when issueNumber is not provided', async () => {
      const exec = mockExec();
      const creator = new PrCreator({ targetBranch: 'main', disabled: false, remote: 'origin' }, exec);

      await creator.create(baseResult, makeLogger());

      const createCmd = exec.mock.calls.find((c: string[]) => c[0].startsWith('gh pr create'))?.[0] ?? '';
      expect(createCmd).not.toMatch(/Fixes #\d+/);
    });

    it('includes Fixes #N in LLM-generated PR body', async () => {
      const llmResponse = [
        'TITLE: fix(auth): patch null check',
        'BODY:',
        '## Summary',
        '- Fixed null check in auth module',
      ].join('\n');
      const llm = { complete: vi.fn().mockResolvedValue(llmResponse) };
      const exec = mockExec();
      const creator = new PrCreator({ targetBranch: 'main', disabled: false, remote: 'origin' }, exec, llm);

      await creator.create(baseResult, makeLogger(), { issueNumber: 42 });

      const createCmd = exec.mock.calls.find((c: string[]) => c[0].startsWith('gh pr create'))?.[0] ?? '';
      expect(createCmd).toContain('Fixes #42');
    });

    it('does not duplicate Fixes #N when LLM already includes it', async () => {
      const llmResponse = [
        'TITLE: fix(auth): patch null check',
        'BODY:',
        '## Summary',
        '- Fixed null check in auth module',
        '',
        'Fixes #42',
      ].join('\n');
      const llm = { complete: vi.fn().mockResolvedValue(llmResponse) };
      const exec = mockExec();
      const creator = new PrCreator({ targetBranch: 'main', disabled: false, remote: 'origin' }, exec, llm);

      await creator.create(baseResult, makeLogger(), { issueNumber: 42 });

      const createCmd = exec.mock.calls.find((c: string[]) => c[0].startsWith('gh pr create'))?.[0] ?? '';
      // Count occurrences of "Fixes #42" — should be exactly 1
      const matches = createCmd.match(/Fixes #42/g);
      expect(matches).toHaveLength(1);
    });

    it('does not change PR title when issueNumber is provided', async () => {
      const exec = mockExec();
      const creator = new PrCreator({ targetBranch: 'main', disabled: false, remote: 'origin' }, exec);

      // Create without issue number
      await creator.create(baseResult, makeLogger());
      const cmdWithout = exec.mock.calls.find((c: string[]) => c[0].startsWith('gh pr create'))?.[0] ?? '';
      const titleWithout = cmdWithout.match(/--title\s+'([^']*?)'/)?.[1];

      // Reset and create with issue number
      exec.mockClear();
      exec.mockImplementation((cmd: string) => {
        if (cmd.startsWith('git branch --show-current')) return 'fix/issue-42\n';
        if (cmd.startsWith('git push')) return '';
        if (cmd.startsWith('gh pr list')) return '[]';
        if (cmd.startsWith('gh pr create')) return 'https://example.com/pr/42\n';
        if (cmd.startsWith('git diff --stat')) return ' src/auth.ts | 10 ++++\n 1 file changed, 10 insertions(+)\n';
        if (cmd.startsWith('git diff --shortstat')) return ' 1 file changed, 10 insertions(+)';
        if (cmd.startsWith('git log --oneline')) return 'abc1234 fix(auth): patch null check\n';
        return '';
      });

      await creator.create(baseResult, makeLogger(), { issueNumber: 42 });
      const cmdWith = exec.mock.calls.find((c: string[]) => c[0].startsWith('gh pr create'))?.[0] ?? '';
      const titleWith = cmdWith.match(/--title\s+'([^']*?)'/)?.[1];

      expect(titleWith).toBe(titleWithout);
    });
  });

  describe('LLM prompt includes issue context', () => {
    it('mentions the issue number in the LLM prompt for PR description', async () => {
      const llmResponse = [
        'TITLE: fix(auth): patch null check',
        'BODY:',
        '## Summary',
        '- Fixed null check',
      ].join('\n');
      const llm = { complete: vi.fn().mockResolvedValue(llmResponse) };
      const exec = mockExec();
      const creator = new PrCreator({ targetBranch: 'main', disabled: false, remote: 'origin' }, exec, llm);

      await creator.create(baseResult, makeLogger(), { issueNumber: 42 });

      // The LLM prompt should mention the issue number
      const promptArg = llm.complete.mock.calls[0]?.[0] as string;
      expect(promptArg).toContain('#42');
    });
  });

  describe('backward compatibility', () => {
    it('existing create() call without options still works', async () => {
      const exec = mockExec();
      const creator = new PrCreator({ targetBranch: 'main', disabled: false, remote: 'origin' }, exec);

      const result = await creator.create(baseResult, makeLogger());

      expect(result?.url).toBe('https://example.com/pr/42');
    });
  });

  describe('branch equals target fallback', () => {
    it('targets main when current branch equals non-main target branch', async () => {
      const exec = mockExec({
        'git branch --show-current': 'feat/my-feature\n',
      });
      const creator = new PrCreator({ targetBranch: 'feat/my-feature', disabled: false, remote: 'origin' }, exec);

      await creator.create(baseResult, makeLogger());

      const createCmd = exec.mock.calls.find((c: string[]) => c[0].startsWith('gh pr create'))?.[0] ?? '';
      expect(createCmd).toContain('--base main');
    });

    it('skips when current branch is main and target is main', async () => {
      const exec = mockExec({
        'git branch --show-current': 'main\n',
      });
      const logger = makeLogger();
      const creator = new PrCreator({ targetBranch: 'main', disabled: false, remote: 'origin' }, exec);

      const result = await creator.create(baseResult, logger);

      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        'PrCreator: skipped — current branch is main, cannot PR main to main',
        expect.objectContaining({ branch: 'main' }),
      );
    });

    it('uses main for git context when falling back', async () => {
      const exec = mockExec({
        'git branch --show-current': 'feat/my-feature\n',
      });
      const creator = new PrCreator({ targetBranch: 'feat/my-feature', disabled: false, remote: 'origin' }, exec);

      await creator.create(baseResult, makeLogger());

      // git diff/log commands should reference main, not feat/my-feature
      const diffCalls = exec.mock.calls.filter((c: string[]) => c[0].startsWith('git diff --stat'));
      const logCalls = exec.mock.calls.filter((c: string[]) => c[0].startsWith('git log --oneline'));
      for (const call of [...diffCalls, ...logCalls]) {
        expect(call[0]).toContain('main');
      }
    });
  });

  describe('standardized subprocess failures', () => {
    it('logs a canonical failure payload when gh pr create fails', async () => {
      const exec = mockExec({
        'gh pr create': Object.assign(new Error('gh failed'), {
          status: 1,
          stderr: Buffer.from('rate limit exceeded'),
        }),
      });
      const logger = makeLogger();
      const creator = new PrCreator({ targetBranch: 'main', disabled: false, remote: 'origin' }, exec);

      const result = await creator.create(baseResult, logger);

      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledWith(
        'PrCreator: failed to create PR',
        expect.objectContaining({
          kind: 'command_failed',
          tool: 'gh',
          command: 'gh pr create',
          stderr: 'rate limit exceeded',
        }),
      );
    });
  });
});
