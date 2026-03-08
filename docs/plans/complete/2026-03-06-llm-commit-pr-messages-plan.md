# LLM-Powered Squash Commits & PR Descriptions — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace meaningless `auto: impl X iter N` commit messages and generic PR descriptions with LLM-generated semver-compatible conventional commits and rich PR bodies.

**Architecture:** Three layers change — `GitBranchIsolator.merge()` gains squash merge support, `PrCreator` gains optional `ILlmClient` for message generation, and `CliSkillExecutor` wires commit message generation before merge. All changes are backward-compatible via optional parameters.

**Tech Stack:** TypeScript, Vitest, `@franken/types` (`ILlmClient`), `node:child_process`

**Design doc:** `docs/plans/2026-03-06-llm-commit-pr-messages-design.md`

---

## Task 1: GitBranchIsolator — squash merge with optional commit message

**Files:**
- Modify: `franken-orchestrator/src/skills/git-branch-isolator.ts:55-75`
- Test: `franken-orchestrator/tests/unit/skills/git-branch-isolator.test.ts`

### Step 1: Write failing tests for squash merge

Add these tests to the `merge()` describe block in `git-branch-isolator.test.ts`:

```typescript
it('uses squash merge when commitMessage is provided', () => {
  mockExecSync.mockImplementation((cmd: string) => {
    if (cmd === 'git rev-list --count main..chunk/03_my_chunk') return '3\n';
    return '';
  });

  const result = isolator.merge('03_my_chunk', 'feat(types): add shared type definitions');

  expect(result).toEqual({ merged: true, commits: 3 });
  expect(mockExecSync).toHaveBeenCalledWith(
    'git merge --squash chunk/03_my_chunk',
    expect.objectContaining({ cwd: '/fake/repo' }),
  );
  expect(mockExecSync).toHaveBeenCalledWith(
    'git commit -m "feat(types): add shared type definitions"',
    expect.objectContaining({ cwd: '/fake/repo' }),
  );
});

it('falls back to regular merge when no commitMessage provided', () => {
  mockExecSync.mockImplementation((cmd: string) => {
    if (cmd === 'git rev-list --count main..chunk/03_my_chunk') return '3\n';
    return '';
  });

  const result = isolator.merge('03_my_chunk');

  expect(result).toEqual({ merged: true, commits: 3 });
  expect(mockExecSync).toHaveBeenCalledWith(
    'git merge chunk/03_my_chunk --no-edit',
    expect.objectContaining({ cwd: '/fake/repo' }),
  );
});

it('aborts squash merge on conflict and returns merged: false', () => {
  mockExecSync.mockImplementation((cmd: string) => {
    if (cmd === 'git rev-list --count main..chunk/03_my_chunk') return '2\n';
    if (cmd === 'git checkout main') return '';
    if (cmd === 'git merge --squash chunk/03_my_chunk') {
      throw new Error('CONFLICT');
    }
    return '';
  });

  const result = isolator.merge('03_my_chunk', 'feat(types): add types');

  expect(result).toEqual({ merged: false, commits: 2 });
  expect(mockExecSync).toHaveBeenCalledWith(
    'git merge --abort',
    expect.objectContaining({ cwd: '/fake/repo' }),
  );
});

it('sanitizes commitMessage to prevent shell injection', () => {
  mockExecSync.mockImplementation((cmd: string) => {
    if (cmd.startsWith('git rev-list')) return '1\n';
    return '';
  });

  // The commit message with quotes should not break the command
  isolator.merge('03_my_chunk', 'feat(types): add "shared" types');

  expect(mockExecSync).toHaveBeenCalledWith(
    expect.stringContaining('feat(types): add \\"shared\\" types'),
    expect.objectContaining({ cwd: '/fake/repo' }),
  );
});
```

### Step 2: Run tests to verify they fail

Run: `cd franken-orchestrator && npx vitest run tests/unit/skills/git-branch-isolator.test.ts`
Expected: FAIL — `merge()` does not accept a second argument, squash tests fail

### Step 3: Implement squash merge in GitBranchIsolator

Replace the `merge()` method in `git-branch-isolator.ts`:

```typescript
merge(chunkId: string, commitMessage?: string): { merged: boolean; commits: number } {
  assertSafeId(chunkId);
  const branch = this.branchName(chunkId);
  const count = parseInt(
    this.git(`rev-list --count ${this.config.baseBranch}..${branch}`),
    10,
  ) || 0;

  if (count === 0) {
    return { merged: false, commits: 0 };
  }

  this.git(`checkout ${this.config.baseBranch}`);
  try {
    if (commitMessage) {
      const safeMsg = commitMessage.replace(/"/g, '\\"');
      this.git(`merge --squash ${branch}`);
      this.git(`commit -m "${safeMsg}"`);
    } else {
      this.git(`merge ${branch} --no-edit`);
    }
    return { merged: true, commits: count };
  } catch {
    this.git('merge --abort');
    return { merged: false, commits: count };
  }
}
```

### Step 4: Run tests to verify they pass

Run: `cd franken-orchestrator && npx vitest run tests/unit/skills/git-branch-isolator.test.ts`
Expected: ALL PASS

### Step 5: Commit

```bash
cd franken-orchestrator && git add -A && git commit -m "feat(git-isolator): add squash merge with optional commit message"
```

---

## Task 2: PrCreator — add ILlmClient and generation methods

**Files:**
- Modify: `franken-orchestrator/src/closure/pr-creator.ts`
- Test: `franken-orchestrator/tests/unit/pr-creator.test.ts`

### Step 1: Write failing tests for generateCommitMessage

Add to `pr-creator.test.ts`:

```typescript
describe('generateCommitMessage()', () => {
  it('generates a commit message from LLM when client is provided', async () => {
    const llm = { complete: vi.fn().mockResolvedValue('feat(auth): add JWT validation') };
    const exec = vi.fn(() => '');
    const creator = new PrCreator({ targetBranch: 'main', disabled: false, remote: 'origin' }, exec, llm);

    const msg = await creator.generateCommitMessage('src/auth.ts | 42 +++ 3 ---', 'Add JWT authentication');

    expect(msg).toBe('feat(auth): add JWT validation');
    expect(llm.complete).toHaveBeenCalledWith(expect.stringContaining('Add JWT authentication'));
    expect(llm.complete).toHaveBeenCalledWith(expect.stringContaining('src/auth.ts'));
  });

  it('falls back to static message when LLM is not provided', async () => {
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

    expect(msg).toBe('feat(auth): add JWT');
  });

  it('truncates messages longer than 72 chars', async () => {
    const longMsg = 'feat(auth): ' + 'a'.repeat(100);
    const llm = { complete: vi.fn().mockResolvedValue(longMsg) };
    const exec = vi.fn(() => '');
    const creator = new PrCreator({ targetBranch: 'main', disabled: false, remote: 'origin' }, exec, llm);

    const msg = await creator.generateCommitMessage('diff stat', 'objective');

    expect(msg!.length).toBeLessThanOrEqual(72);
  });
});
```

### Step 2: Run tests to verify they fail

Run: `cd franken-orchestrator && npx vitest run tests/unit/pr-creator.test.ts`
Expected: FAIL — `generateCommitMessage` does not exist, constructor doesn't accept 3rd arg

### Step 3: Implement generateCommitMessage on PrCreator

In `pr-creator.ts`, add the `ILlmClient` import and update the class:

```typescript
// Add at top of file:
import type { ILlmClient } from '@franken/types';

// Update class:
export class PrCreator {
  private readonly config: PrCreatorConfig;
  private readonly exec: ExecFn;
  private readonly llm?: ILlmClient;

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
      return cleanCommitMessage(raw);
    } catch {
      return null;
    }
  }

  // ... rest of class unchanged
}

// Add helper at bottom:
function cleanCommitMessage(raw: string): string {
  let msg = raw.trim();
  // Strip markdown code fences
  msg = msg.replace(/^```[\s\S]*?\n?/, '').replace(/\n?```\s*$/, '').trim();
  // Take first non-empty line only
  const firstLine = msg.split('\n').find(l => l.trim().length > 0) ?? msg;
  // Truncate to 72 chars
  return firstLine.length > 72 ? firstLine.slice(0, 72) : firstLine;
}
```

### Step 4: Run tests to verify they pass

Run: `cd franken-orchestrator && npx vitest run tests/unit/pr-creator.test.ts`
Expected: ALL PASS

### Step 5: Commit

```bash
cd franken-orchestrator && git add -A && git commit -m "feat(pr-creator): add LLM-powered commit message generation"
```

---

## Task 3: PrCreator — add generatePrDescription

**Files:**
- Modify: `franken-orchestrator/src/closure/pr-creator.ts`
- Test: `franken-orchestrator/tests/unit/pr-creator.test.ts`

### Step 1: Write failing tests for generatePrDescription

Add to `pr-creator.test.ts`:

```typescript
describe('generatePrDescription()', () => {
  it('generates PR title and body from LLM when client is provided', async () => {
    const llmResponse = [
      'TITLE: feat(orchestrator): add CLI execution pipeline',
      'BODY:',
      '## Summary',
      '- Added CLI skill executor with RALPH loop integration',
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
    expect(llm.complete).toHaveBeenCalledWith(expect.stringContaining('proj-123'));
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
```

### Step 2: Run tests to verify they fail

Run: `cd franken-orchestrator && npx vitest run tests/unit/pr-creator.test.ts`
Expected: FAIL — `generatePrDescription` does not exist

### Step 3: Implement generatePrDescription on PrCreator

Add to the `PrCreator` class in `pr-creator.ts`:

```typescript
async generatePrDescription(
  commitLog: string,
  diffStat: string,
  result: BeastResult,
): Promise<{ title: string; body: string } | null> {
  if (!this.llm) return null;
  try {
    const prompt = [
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
      '',
      'Respond in this exact format:',
      'TITLE: <title here>',
      'BODY:',
      '<body here>',
    ].join('\n');

    const raw = await this.llm.complete(prompt);
    return parsePrDescription(raw);
  } catch {
    return null;
  }
}
```

Add the parser helper:

```typescript
function parsePrDescription(raw: string): { title: string; body: string } | null {
  const titleMatch = raw.match(/^TITLE:\s*(.+)$/m);
  const bodyMatch = raw.match(/^BODY:\s*\n?([\s\S]+)$/m);
  if (!titleMatch || !bodyMatch) return null;

  let title = titleMatch[1].trim();
  if (title.length > 70) title = title.slice(0, 70);
  const body = bodyMatch[1].trim();
  if (!body) return null;

  return { title, body };
}
```

### Step 4: Run tests to verify they pass

Run: `cd franken-orchestrator && npx vitest run tests/unit/pr-creator.test.ts`
Expected: ALL PASS

### Step 5: Commit

```bash
cd franken-orchestrator && git add -A && git commit -m "feat(pr-creator): add LLM-powered PR description generation"
```

---

## Task 4: PrCreator.create() — use LLM-generated PR title/body

**Files:**
- Modify: `franken-orchestrator/src/closure/pr-creator.ts:28-86`
- Test: `franken-orchestrator/tests/unit/pr-creator.test.ts`

### Step 1: Write failing test for LLM-powered PR creation

Add to `pr-creator.test.ts`:

```typescript
it('uses LLM-generated title and body when ILlmClient is provided', async () => {
  const llmResponse = [
    'TITLE: feat(cli): implement RALPH loop execution pipeline',
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
  expect(createCmd).toContain('feat(cli): implement RALPH loop execution pipeline');
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
  // Falls back to static buildTitle
  expect(createCmd).toContain('feat: proj-123');
});
```

### Step 2: Run tests to verify they fail

Run: `cd franken-orchestrator && npx vitest run tests/unit/pr-creator.test.ts`
Expected: FAIL — `create()` doesn't call LLM or fetch git log/diff

### Step 3: Update PrCreator.create() to use LLM generation

In `pr-creator.ts`, update the `create()` method. After the existing PR check and before the `gh pr create` call, add LLM generation with fallback:

```typescript
// In create(), replace the title/body generation section:
let title: string;
let body: string;

const llmResult = await this.tryGeneratePrFromLlm(branch, result, outcomes, logger);
if (llmResult) {
  title = llmResult.title;
  body = llmResult.body;
} else {
  title = buildTitle(result.projectId, outcomes.length);
  body = buildBody(result, outcomes);
}
```

Add the private helper method:

```typescript
private async tryGeneratePrFromLlm(
  branch: string,
  result: BeastResult,
  outcomes: readonly TaskOutcome[],
  logger?: ILogger,
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
    return await this.generatePrDescription(commitLog, diffStat, result);
  } catch {
    return null;
  }
}
```

### Step 4: Run tests to verify they pass

Run: `cd franken-orchestrator && npx vitest run tests/unit/pr-creator.test.ts`
Expected: ALL PASS

### Step 5: Commit

```bash
cd franken-orchestrator && git add -A && git commit -m "feat(pr-creator): wire LLM generation into create() with static fallback"
```

---

## Task 5: CliSkillExecutor — wire commit message generation before merge

**Files:**
- Modify: `franken-orchestrator/src/skills/cli-skill-executor.ts`
- Test: `franken-orchestrator/tests/unit/skills/cli-skill-executor.test.ts`

### Step 1: Write failing tests for commit message generation in executor

Add to `cli-skill-executor.test.ts`. First update `makeMockGit` to include `getDiffStat`:

```typescript
// Update makeMockGit to add getDiffStat:
function makeMockGit() {
  return {
    isolate: vi.fn(),
    merge: vi.fn().mockReturnValue({ merged: true, commits: 3 }),
    autoCommit: vi.fn(),
    hasMeaningfulChange: vi.fn(),
    getCurrentHead: vi.fn(),
    getDiffStat: vi.fn().mockReturnValue('src/foo.ts | 10 +++\n'),
  };
}
```

Then add the test describe block:

```typescript
describe('commit message generation before merge', () => {
  it('calls commitMessageFn before merge and passes result to merge()', async () => {
    const commitMessageFn = vi.fn().mockResolvedValue('feat(types): add shared type definitions');

    const { CliSkillExecutor } = await import('../../../src/skills/cli-skill-executor.js');
    const executor = new CliSkillExecutor(ralph as any, git as any, observer, undefined, commitMessageFn);
    await executor.execute('cli:01_types', makeSkillInput(), makeCliConfig());

    expect(git.getDiffStat).toHaveBeenCalledWith('01_types');
    expect(commitMessageFn).toHaveBeenCalledWith('src/foo.ts | 10 +++\n', 'Test objective');
    expect(git.merge).toHaveBeenCalledWith('01_types', 'feat(types): add shared type definitions');
  });

  it('passes undefined to merge when commitMessageFn is not provided', async () => {
    const { CliSkillExecutor } = await import('../../../src/skills/cli-skill-executor.js');
    const executor = new CliSkillExecutor(ralph as any, git as any, observer);
    await executor.execute('cli:01_types', makeSkillInput(), makeCliConfig());

    expect(git.merge).toHaveBeenCalledWith('01_types');
  });

  it('passes undefined to merge when commitMessageFn returns null', async () => {
    const commitMessageFn = vi.fn().mockResolvedValue(null);

    const { CliSkillExecutor } = await import('../../../src/skills/cli-skill-executor.js');
    const executor = new CliSkillExecutor(ralph as any, git as any, observer, undefined, commitMessageFn);
    await executor.execute('cli:01_types', makeSkillInput(), makeCliConfig());

    expect(git.merge).toHaveBeenCalledWith('01_types');
  });

  it('falls back to no message when commitMessageFn throws', async () => {
    const commitMessageFn = vi.fn().mockRejectedValue(new Error('LLM down'));

    const { CliSkillExecutor } = await import('../../../src/skills/cli-skill-executor.js');
    const executor = new CliSkillExecutor(ralph as any, git as any, observer, undefined, commitMessageFn);
    await executor.execute('cli:01_types', makeSkillInput(), makeCliConfig());

    // Should still merge, just without a message
    expect(git.merge).toHaveBeenCalledWith('01_types');
  });
});
```

### Step 2: Run tests to verify they fail

Run: `cd franken-orchestrator && npx vitest run tests/unit/skills/cli-skill-executor.test.ts`
Expected: FAIL — constructor doesn't accept 5th arg, `getDiffStat` doesn't exist

### Step 3: Add getDiffStat to GitBranchIsolator

In `git-branch-isolator.ts`, add:

```typescript
getDiffStat(chunkId: string): string {
  assertSafeId(chunkId);
  const branch = this.branchName(chunkId);
  return this.git(`diff --stat ${this.config.baseBranch}..${branch}`);
}
```

### Step 4: Write test for getDiffStat in git-branch-isolator.test.ts

```typescript
describe('getDiffStat()', () => {
  it('returns diff stat between base branch and chunk branch', () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd === 'git diff --stat main..chunk/03_my_chunk') {
        return ' src/foo.ts | 10 +++\n 1 file changed\n';
      }
      return '';
    });

    expect(isolator.getDiffStat('03_my_chunk')).toBe('src/foo.ts | 10 +++\n 1 file changed');
  });
});
```

### Step 5: Implement commitMessageFn wiring in CliSkillExecutor

Update `CliSkillExecutor` constructor and `execute()`:

```typescript
// Type alias for the commit message function
type CommitMessageFn = (diffStat: string, objective: string) => Promise<string | null>;

export class CliSkillExecutor {
  private readonly ralph: RalphLoop;
  private readonly git: GitBranchIsolator;
  private readonly observer: ObserverDeps;
  private readonly verifyCommand?: string | undefined;
  private readonly commitMessageFn?: CommitMessageFn;

  constructor(
    ralph: RalphLoop,
    git: GitBranchIsolator,
    observer: ObserverDeps,
    verifyCommand?: string,
    commitMessageFn?: CommitMessageFn,
  ) {
    this.ralph = ralph;
    this.git = git;
    this.observer = observer;
    this.verifyCommand = verifyCommand;
    this.commitMessageFn = commitMessageFn;
  }

  // In execute(), replace the merge section (lines ~233-251):
  // Before the existing "// Git merge" comment, add:
  let commitMessage: string | undefined;
  if (this.commitMessageFn) {
    try {
      const diffStat = this.git.getDiffStat(chunkId);
      const msg = await this.commitMessageFn(diffStat, _input.objective);
      if (msg) commitMessage = msg;
    } catch {
      // Silently fall back to no message — never block the pipeline
    }
  }

  // Then update the merge call:
  mergeResult = commitMessage
    ? this.git.merge(chunkId, commitMessage)
    : this.git.merge(chunkId);
```

### Step 6: Run all tests

Run: `cd franken-orchestrator && npx vitest run tests/unit/skills/cli-skill-executor.test.ts tests/unit/skills/git-branch-isolator.test.ts`
Expected: ALL PASS

### Step 7: Commit

```bash
cd franken-orchestrator && git add -A && git commit -m "feat(cli-executor): wire commit message generation before squash merge"
```

---

## Task 6: Full integration verification

**Files:**
- Test: all modified test files

### Step 1: Run the full test suite

Run: `cd franken-orchestrator && npx vitest run`
Expected: ALL PASS — no regressions

### Step 2: Verify TypeScript compilation

Run: `cd franken-orchestrator && npx tsc --noEmit`
Expected: No errors

### Step 3: Commit final state

```bash
cd franken-orchestrator && git add -A && git commit -m "test: verify full suite passes with LLM commit/PR generation"
```

(Only if there were any fixups needed. Skip if clean.)

---

## Wiring Summary (for build-runner authors)

After these changes, build runners wire the feature like this:

```typescript
import type { ILlmClient } from '@franken/types';

// Create PrCreator with LLM client
const llmClient: ILlmClient = { complete: (prompt) => callYourLlm(prompt) };
const prCreator = new PrCreator(
  { targetBranch: 'main', disabled: false, remote: 'origin' },
  undefined, // default exec
  llmClient,
);

// Create CliSkillExecutor with commit message function
const executor = new CliSkillExecutor(
  ralph,
  git,
  observer,
  verifyCommand,
  (diffStat, objective) => prCreator.generateCommitMessage(diffStat, objective),
);
```

When `ILlmClient` is not provided, everything works exactly as before.
