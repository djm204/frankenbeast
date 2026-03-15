import { describe, it, expect, vi } from 'vitest';
import { PrCreator } from '../../src/closure/pr-creator.js';
import type { BeastResult, TaskOutcome } from '../../src/types.js';

const baseResult: BeastResult = {
  sessionId: 'sess',
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
    { taskId: 'impl:01_checkpoint_store', status: 'success' },
    { taskId: 'harden:01_checkpoint_store', status: 'success' },
  ],
  durationMs: 185_000,
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
    if (cmd.startsWith('git branch --show-current')) return 'feature/branch\n';
    if (cmd.startsWith('git push')) return '';
    if (cmd.startsWith('gh pr list')) return '[]';
    if (cmd.startsWith('gh pr create')) return 'https://example.com/pr/1\n';
    if (cmd.startsWith('git diff --stat')) return ' src/foo.ts | 10 ++++\n src/bar.ts | 5 ++\n 2 files changed, 15 insertions(+)\n';
    if (cmd.startsWith('git diff --shortstat')) return ' 2 files changed, 15 insertions(+)';
    if (cmd.startsWith('git log --oneline')) return 'abc1234 auto: impl 01_checkpoint_store iter 1\ndef5678 auto: harden 01_checkpoint_store iter 1\n';
    return '';
  });
}

describe('PrCreator', () => {
  it('skips when disabled', async () => {
    const exec = vi.fn(() => { throw new Error('should not call'); });
    const creator = new PrCreator({ targetBranch: 'main', disabled: true, remote: 'origin' }, exec);
    const logger = makeLogger();

    const result = await creator.create(baseResult, logger);

    expect(result).toBeNull();
    expect(exec).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('skips when not all tasks completed', async () => {
    const exec = vi.fn(() => '');
    const creator = new PrCreator({ targetBranch: 'main', disabled: false, remote: 'origin' }, exec);
    const logger = makeLogger();
    const failed: BeastResult = {
      ...baseResult,
      status: 'failed',
      taskResults: [
        { taskId: 'impl:01_checkpoint_store', status: 'success' },
        { taskId: 'impl:02_chunk_builder', status: 'failure', error: 'boom' },
      ],
    };

    const result = await creator.create(failed, logger);

    expect(result).toBeNull();
    expect(exec).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('pushes branch and creates PR with descriptive body', async () => {
    const exec = mockExec();
    const creator = new PrCreator({ targetBranch: 'main', disabled: false, remote: 'origin' }, exec);
    const logger = makeLogger();
    const result = await creator.create(baseResult, logger);

    expect(result?.url).toBe('https://example.com/pr/1');

    const createCmd = exec.mock.calls.find((c: string[]) => c[0].startsWith('gh pr create'))?.[0] ?? '';

    // Body should include What Changed section with chunk descriptions
    expect(createCmd).toContain('## What Changed');
    expect(createCmd).toContain('checkpoint store');
    expect(createCmd).toContain('implemented');

    // Stats section
    expect(createCmd).toContain('## Stats');
    expect(createCmd).toContain('2/2 succeeded');
    expect(createCmd).toContain('Duration');
    expect(createCmd).toContain('$0.45');

    // Files Changed section
    expect(createCmd).toContain('## Files Changed');
    expect(createCmd).toContain('2 files changed');

    // Task details in collapsible section
    expect(createCmd).toContain('<details>');
    expect(createCmd).toContain('Task Details');
    expect(createCmd).toContain('impl:01_checkpoint_store');
  });

  it('trims PR title to stay under 70 characters', async () => {
    const exec = mockExec();
    const creator = new PrCreator({ targetBranch: 'main', disabled: false, remote: 'origin' }, exec);

    const manyTasks: TaskOutcome[] = [];
    for (let i = 1; i <= 10; i++) {
      manyTasks.push({ taskId: `impl:${String(i).padStart(2, '0')}_some_long_chunk_name`, status: 'success' });
      manyTasks.push({ taskId: `harden:${String(i).padStart(2, '0')}_some_long_chunk_name`, status: 'success' });
    }

    const longResult: BeastResult = {
      ...baseResult,
      projectId: 'project-with-a-super-long-identifier-that-should-be-trimmed-for-title-length',
      taskResults: manyTasks,
    };

    await creator.create(longResult, makeLogger());

    const createCmd = exec.mock.calls.find((c: string[]) => c[0].startsWith('gh pr create')) ?? [''];
    const titleMatch = (createCmd[0] as string).match(/--title\s+('.*?'|".*?")/);
    expect(titleMatch).toBeTruthy();
    const rawTitle = titleMatch?.[1] ?? '';
    const title = rawTitle.slice(1, -1);
    expect(title.length).toBeLessThanOrEqual(70);
  });

  it('uses chunk names in title when 3 or fewer chunks', async () => {
    const exec = mockExec();
    const creator = new PrCreator({ targetBranch: 'main', disabled: false, remote: 'origin' }, exec);

    await creator.create(baseResult, makeLogger());

    const createCmd = exec.mock.calls.find((c: string[]) => c[0].startsWith('gh pr create'))?.[0] ?? '';
    // Should use chunk name not project ID for small PRs
    expect(createCmd).toContain('01_checkpoint_store');
  });

  it('skips when current branch equals target branch', async () => {
    const exec = mockExec({
      'git branch --show-current': 'main\n',
    });
    const creator = new PrCreator({ targetBranch: 'main', disabled: false, remote: 'origin' }, exec);
    const logger = makeLogger();

    const result = await creator.create(baseResult, logger);

    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('cannot PR main to main'),
      expect.objectContaining({ branch: 'main' }),
    );
    // Should not attempt to push or create PR
    expect(exec).not.toHaveBeenCalledWith(expect.stringContaining('git push'), expect.anything());
    expect(exec).not.toHaveBeenCalledWith(expect.stringContaining('gh pr create'), expect.anything());
  });

  it('skips when PR already exists', async () => {
    const exec = mockExec({
      'gh pr list': '[{"url":"https://example.com/pr/99"}]',
    });

    const creator = new PrCreator({ targetBranch: 'main', disabled: false, remote: 'origin' }, exec);
    const result = await creator.create(baseResult, makeLogger());

    expect(result).toBeNull();
  });

  it('handles missing gh gracefully', async () => {
    const exec = mockExec({
      'gh pr list': new Error('gh: command not found'),
    });

    const creator = new PrCreator({ targetBranch: 'main', disabled: false, remote: 'origin' }, exec);
    const logger = makeLogger();
    const result = await creator.create(baseResult, logger);

    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('handles push failure gracefully', async () => {
    const exec = mockExec({
      'git push': new Error('push failed'),
    });

    const creator = new PrCreator({ targetBranch: 'main', disabled: false, remote: 'origin' }, exec);
    const logger = makeLogger();
    const result = await creator.create(baseResult, logger);

    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalled();
  });

  describe('generatePrDescription()', () => {
    it('generates PR title and body from LLM when client is provided', async () => {
      const llmResponse = [
        'TITLE: feat(orchestrator): add CLI execution pipeline',
        'BODY:',
        '## Summary',
        '- Added CLI skill executor with Martin loop integration',
        '- Implemented git branch isolation per chunk',
        '',
        '## Changes',
        '- `src/skills/cli-skill-executor.ts` — main executor',
      ].join('\n');
      const llm = { complete: vi.fn().mockResolvedValue(llmResponse) };
      const exec = vi.fn(() => '');
      const creator = new PrCreator({ targetBranch: 'main', disabled: false, remote: 'origin' }, exec, llm);

      const result = await creator.generatePrDescription(
        'abc123 feat: first\ndef456 feat: second',
        'file1.ts | 10 +++\nfile2.ts | 5 ---',
        baseResult,
      );

      expect(result).not.toBeNull();
      expect(result!.title).toBe('feat(orchestrator): add CLI execution pipeline');
      expect(result!.body).toContain('## Summary');
      expect(llm.complete).toHaveBeenCalled();
      expect(llm.complete.mock.calls[0]?.[0]).toContain('proj-123');
    });

    it('falls back to null when LLM is not provided', async () => {
      const exec = vi.fn(() => '');
      const creator = new PrCreator({ targetBranch: 'main', disabled: false, remote: 'origin' }, exec);

      const result = await creator.generatePrDescription('commits', 'diff', baseResult);

      expect(result).toBeNull();
    });

    it('falls back to null when LLM call fails', async () => {
      const llm = { complete: vi.fn().mockRejectedValue(new Error('timeout')) };
      const exec = vi.fn(() => '');
      const creator = new PrCreator({ targetBranch: 'main', disabled: false, remote: 'origin' }, exec, llm);

      const result = await creator.generatePrDescription('commits', 'diff', baseResult);

      expect(result).toBeNull();
    });

    it('falls back to null when LLM returns malformed response', async () => {
      const llm = { complete: vi.fn().mockResolvedValue('just some random text without TITLE/BODY markers') };
      const exec = vi.fn(() => '');
      const creator = new PrCreator({ targetBranch: 'main', disabled: false, remote: 'origin' }, exec, llm);

      const result = await creator.generatePrDescription('commits', 'diff', baseResult);

      expect(result).toBeNull();
    });

    it('truncates title to 70 chars', async () => {
      const longTitle = 'feat(orchestrator): ' + 'a'.repeat(100);
      const llm = { complete: vi.fn().mockResolvedValue(`TITLE: ${longTitle}\nBODY:\nsome body`) };
      const exec = vi.fn(() => '');
      const creator = new PrCreator({ targetBranch: 'main', disabled: false, remote: 'origin' }, exec, llm);

      const result = await creator.generatePrDescription('commits', 'diff', baseResult);

      expect(result!.title.length).toBeLessThanOrEqual(70);
    });
  });

  describe('generateCommitMessage()', () => {
    it('generates a commit message from LLM when client is provided', async () => {
      const llm = { complete: vi.fn().mockResolvedValue('feat(auth): add JWT validation') };
      const exec = vi.fn(() => '');
      const creator = new PrCreator({ targetBranch: 'main', disabled: false, remote: 'origin' }, exec, llm);

      const msg = await creator.generateCommitMessage('src/auth.ts | 42 +++ 3 ---', 'Add JWT authentication');

      expect(msg).toBe('feat(auth): add JWT validation\n\nmade with Frankenbeast 🧟');
      expect(llm.complete).toHaveBeenCalled();
      expect(llm.complete.mock.calls[0]?.[0]).toContain('Add JWT authentication');
      expect(llm.complete.mock.calls[0]?.[0]).toContain('src/auth.ts');
    });

    it('falls back to null when LLM is not provided', async () => {
      const exec = vi.fn(() => '');
      const creator = new PrCreator({ targetBranch: 'main', disabled: false, remote: 'origin' }, exec);

      const msg = await creator.generateCommitMessage('src/auth.ts | 5 +++', 'Add auth');

      expect(msg).toBeNull();
    });

    it('falls back to null when LLM call fails', async () => {
      const llm = { complete: vi.fn().mockRejectedValue(new Error('rate limited')) };
      const exec = vi.fn(() => '');
      const creator = new PrCreator({ targetBranch: 'main', disabled: false, remote: 'origin' }, exec, llm);

      const msg = await creator.generateCommitMessage('src/auth.ts | 5 +++', 'Add auth');

      expect(msg).toBeNull();
    });

    it('trims and strips backticks from LLM response', async () => {
      const llm = { complete: vi.fn().mockResolvedValue('```\nfeat(auth): add JWT\n```\n') };
      const exec = vi.fn(() => '');
      const creator = new PrCreator({ targetBranch: 'main', disabled: false, remote: 'origin' }, exec, llm);

      const msg = await creator.generateCommitMessage('diff stat', 'objective');

      expect(msg).toBe('feat(auth): add JWT\n\nmade with Frankenbeast 🧟');
    });

    it('truncates messages longer than 72 chars', async () => {
      const longMsg = 'feat(auth): ' + 'a'.repeat(100);
      const llm = { complete: vi.fn().mockResolvedValue(longMsg) };
      const exec = vi.fn(() => '');
      const creator = new PrCreator({ targetBranch: 'main', disabled: false, remote: 'origin' }, exec, llm);

      const msg = await creator.generateCommitMessage('diff stat', 'objective');

      const subjectLine = msg!.split('\n')[0];
      expect(subjectLine.length).toBeLessThanOrEqual(72);
      expect(msg).toContain('made with Frankenbeast 🧟');
    });
  });

  it('uses iteration count from output when provided', async () => {
    const exec = mockExec();
    const creator = new PrCreator({ targetBranch: 'main', disabled: false, remote: 'origin' }, exec);
    const resultWithIterations: BeastResult = {
      ...baseResult,
      taskResults: [
        { taskId: 'impl:01_checkpoint_store', status: 'success', output: { iterations: 3 } },
      ] as TaskOutcome[],
    };

    await creator.create(resultWithIterations, makeLogger());

    const createCmd = exec.mock.calls.find((c: string[]) => c[0].startsWith('gh pr create'))?.[0] ?? '';
    expect(createCmd).toContain('| impl:01_checkpoint_store | pass | 3 |');
  });

  it('includes commit log in collapsible section', async () => {
    const exec = mockExec();
    const creator = new PrCreator({ targetBranch: 'main', disabled: false, remote: 'origin' }, exec);

    await creator.create(baseResult, makeLogger());

    const createCmd = exec.mock.calls.find((c: string[]) => c[0].startsWith('gh pr create'))?.[0] ?? '';
    expect(createCmd).toContain('Commit Log');
    expect(createCmd).toContain('abc1234');
  });

  it('formats duration in human-readable form', async () => {
    const exec = mockExec();
    const creator = new PrCreator({ targetBranch: 'main', disabled: false, remote: 'origin' }, exec);

    const longRun: BeastResult = {
      ...baseResult,
      durationMs: 3_723_000, // 1h 2m 3s
    };

    await creator.create(longRun, makeLogger());

    const createCmd = exec.mock.calls.find((c: string[]) => c[0].startsWith('gh pr create'))?.[0] ?? '';
    expect(createCmd).toContain('1h 2m');
  });

  it('gracefully handles missing git context', async () => {
    const exec = vi.fn((cmd: string) => {
      if (cmd.startsWith('git branch --show-current')) return 'feature/branch\n';
      if (cmd.startsWith('git push')) return '';
      if (cmd.startsWith('gh pr list')) return '[]';
      if (cmd.startsWith('gh pr create')) return 'https://example.com/pr/5\n';
      // All git diff/log commands fail
      throw new Error('not a git repo');
    });

    const creator = new PrCreator({ targetBranch: 'main', disabled: false, remote: 'origin' }, exec);
    const result = await creator.create(baseResult, makeLogger());

    // Should still create PR even without git context
    expect(result?.url).toBe('https://example.com/pr/5');
  });

  it('uses LLM-generated title and body when ILlmClient is provided', async () => {
    const llmResponse = [
      'TITLE: feat(cli): implement Martin loop execution pipeline',
      'BODY:',
      '## Summary',
      '- Integrated CLI skill executor',
      '',
      '## Changes',
      '- `src/skills/cli-skill-executor.ts`',
    ].join('\n');
    const llm = { complete: vi.fn().mockResolvedValue(llmResponse) };
    const calls: string[] = [];
    const exec = vi.fn((cmd: string) => {
      calls.push(cmd);
      if (cmd.startsWith('git branch --show-current')) return 'feature/branch\n';
      if (cmd.startsWith('git push')) return '';
      if (cmd.startsWith('gh pr list')) return '[]';
      if (cmd.startsWith('git log')) return 'abc123 feat: first\ndef456 feat: second\n';
      if (cmd.startsWith('git diff --stat')) return 'file1.ts | 10 +++\n';
      if (cmd.startsWith('gh pr create')) return 'https://example.com/pr/5\n';
      return '';
    });

    const creator = new PrCreator({ targetBranch: 'main', disabled: false, remote: 'origin' }, exec, llm);
    const result = await creator.create(baseResult, makeLogger());

    expect(result?.url).toBe('https://example.com/pr/5');
    const createCmd = calls.find(c => c.startsWith('gh pr create')) ?? '';
    expect(createCmd).toContain('feat(cli): implement Martin loop execution pipeline');
  });

  it('falls back to static title/body when LLM generation fails', async () => {
    const llm = { complete: vi.fn().mockRejectedValue(new Error('rate limited')) };
    const calls: string[] = [];
    const exec = vi.fn((cmd: string) => {
      calls.push(cmd);
      if (cmd.startsWith('git branch --show-current')) return 'feature/branch\n';
      if (cmd.startsWith('git push')) return '';
      if (cmd.startsWith('gh pr list')) return '[]';
      if (cmd.startsWith('git log')) return 'abc123 feat: first\n';
      if (cmd.startsWith('git diff --stat')) return 'file1.ts | 10 +++\n';
      if (cmd.startsWith('gh pr create')) return 'https://example.com/pr/6\n';
      return '';
    });

    const creator = new PrCreator({ targetBranch: 'main', disabled: false, remote: 'origin' }, exec, llm);
    const result = await creator.create(baseResult, makeLogger());

    expect(result?.url).toBe('https://example.com/pr/6');
    const createCmd = calls.find(c => c.startsWith('gh pr create')) ?? '';
    // Falls back to static buildTitle (uses chunk names for small PRs)
    expect(createCmd).toContain('feat: 01_checkpoint_store');
  });
});
