import { describe, it, expect } from 'vitest';
import { PrCreationRequiredActionError, PrCreator } from '../../src/closure/pr-creator.js';
import type { BeastResult, TaskOutcome } from '../../src/types.js';

interface ExecCall {
  readonly command: string;
  readonly args: readonly string[];
}

function makeResult(overrides: Partial<BeastResult> = {}): BeastResult {
  return {
    projectId: 'test-project',
    status: 'completed',
    durationMs: 60000,
    tokenSpend: { totalTokens: 5000, estimatedCostUsd: 0.1 },
    taskResults: [
      { taskId: 'impl:01_setup', status: 'success', output: {} },
    ] as TaskOutcome[],
    ...overrides,
  };
}

/**
 * Records every exec invocation as (command, argv[]). The new contract is that
 * PrCreator never builds a shell string — it passes the binary name and a
 * discrete argument array, so values can never be interpreted by a shell.
 */
function makeExecRecorder(branch: string) {
  const calls: ExecCall[] = [];
  const exec = (command: string, args: readonly string[] = []): string => {
    calls.push({ command, args });
    if (args.includes('--show-current')) return `${branch}\n`;
    if (command === 'gh' && args.includes('list')) return '[]';
    if (command === 'gh' && args.includes('create')) return 'https://example.com/pr/1\n';
    return '';
  };
  return { exec, calls };
}

describe('PrCreator argv subprocess safety', () => {
  it('passes branch, remote and base as discrete argv elements (no shell string)', async () => {
    const { exec, calls } = makeExecRecorder('feature/foo');
    const creator = new PrCreator(
      { targetBranch: 'main', disabled: false, remote: 'origin' },
      exec,
    );

    const result = await creator.create(makeResult());

    expect(result).toEqual({ url: 'https://example.com/pr/1' });

    const push = calls.find(c => c.command === 'git' && c.args.includes('push'));
    expect(push).toBeDefined();
    expect(push!.args).toEqual([
      'push', 'origin', 'refs/heads/feature/foo:refs/heads/feature/foo',
    ]);

    const list = calls.find(c => c.command === 'gh' && c.args.includes('list'));
    expect(list).toBeDefined();
    // The branch must appear as a standalone argv element, never concatenated.
    expect(list!.args).toContain('feature/foo');
    expect(list!.args.some(a => a.includes(' '))).toBe(false);

    const create = calls.find(c => c.command === 'gh' && c.args.includes('create'));
    expect(create).toBeDefined();
    expect(create!.args.slice(0, 4)).toEqual(['pr', 'create', '--base', 'main']);
    // No argv element should be a packed shell command.
    expect(create!.args).toContain('--title');
    expect(create!.args).toContain('--body');
  });

  it('keeps hostile PR titles and bodies as single gh argv values', async () => {
    const { exec, calls } = makeExecRecorder('feature/security-boundary');
    const hostileTitle = 'fix: close issue; touch /tmp/pwned';
    const hostileBody = [
      '## Summary',
      '- preserve webhook URL https://hooks.example.test/a?token=$(cat ~/.ssh/id_rsa)',
      '- keep body text with semicolons; pipes | and backticks `uname` literal',
      '',
      'References #1711',
    ].join('\n');
    const llm = { complete: async () => `TITLE: ${hostileTitle}\nBODY:\n${hostileBody}` };
    const creator = new PrCreator(
      { targetBranch: 'main', disabled: false, remote: 'origin', disableBranding: true },
      exec,
      llm,
    );

    const result = await creator.create(makeResult(), undefined, { issueNumber: 1711 });

    expect(result).toEqual({ url: 'https://example.com/pr/1' });
    const create = calls.find(c => c.command === 'gh' && c.args.includes('create'));
    expect(create).toBeDefined();
    const titleIndex = create!.args.indexOf('--title');
    const bodyIndex = create!.args.indexOf('--body');
    expect(create!.args[titleIndex + 1]).toBe(hostileTitle);
    expect(create!.args[bodyIndex + 1]).toContain('$(cat ~/.ssh/id_rsa)');
    expect(create!.args[bodyIndex + 1]).toContain('`uname` literal');
    expect(create!.args[bodyIndex + 1]).toContain('Fixes #1711');
    expect(create!.args.every(arg => arg !== 'touch' && arg !== '/tmp/pwned')).toBe(true);
  });

  it('refuses to run any subprocess when the branch contains shell metacharacters', async () => {
    const { exec, calls } = makeExecRecorder('evil$(touch pwned)');
    const creator = new PrCreator(
      { targetBranch: 'main', disabled: false, remote: 'origin' },
      exec,
    );

    const result = await creator.create(makeResult());

    expect(result).toBeNull();
    // git branch --show-current may run, but nothing that consumes the unsafe ref.
    expect(calls.some(c => c.args.includes('push'))).toBe(false);
    expect(calls.some(c => c.command === 'gh')).toBe(false);
  });

  it('refuses to run when the configured remote is unsafe', async () => {
    const { exec, calls } = makeExecRecorder('feature/foo');
    const creator = new PrCreator(
      { targetBranch: 'main', disabled: false, remote: '--upload-pack=evil' },
      exec,
    );

    const result = await creator.create(makeResult());

    expect(result).toBeNull();
    expect(calls.some(c => c.args.includes('push'))).toBe(false);
  });

  // Codex P2: the previous whitelist rejected valid git refs (e.g. `+`, `@`,
  // `#`), silently aborting PR creation for legitimately-named branches. Because
  // execution is argv-based, these characters carry no shell meaning.
  it.each([
    'feature/foo+bar',
    'feature/foo@bar',
    'release/issue#123',
    'feat/=value',
  ])('creates a PR for valid git ref %s', async (branch) => {
    const { exec, calls } = makeExecRecorder(branch);
    const creator = new PrCreator(
      { targetBranch: 'main', disabled: false, remote: 'origin' },
      exec,
    );

    const result = await creator.create(makeResult());

    expect(result).toEqual({ url: 'https://example.com/pr/1' });
    const push = calls.find(c => c.command === 'git' && c.args.includes('push'));
    expect(push!.args).toEqual([
      'push', 'origin', `refs/heads/${branch}:refs/heads/${branch}`,
    ]);
  });

  // Codex round-2 P2: a branch literally named `+foo` must be published as that
  // branch, not parsed as a `+`-prefixed (force) push refspec.
  it('pushes a plus-prefixed branch by full refspec (never as a force refspec)', async () => {
    const { exec, calls } = makeExecRecorder('+foo');
    const creator = new PrCreator(
      { targetBranch: 'main', disabled: false, remote: 'origin' },
      exec,
    );

    const result = await creator.create(makeResult());

    expect(result).toEqual({ url: 'https://example.com/pr/1' });
    const push = calls.find(c => c.command === 'git' && c.args.includes('push'));
    expect(push!.args).toEqual([
      'push', 'origin', 'refs/heads/+foo:refs/heads/+foo',
    ]);
    // The bare `+foo` (force refspec) form must never be passed.
    expect(push!.args).not.toContain('+foo');
  });

  // Codex round-3 P3: a branch literally named `@` is a valid git ref
  // (`git check-ref-format --branch '@'` exits 0) and pushBranch already
  // qualifies it as `refs/heads/@`, so it must not be special-cased away.
  it('creates a PR for a branch literally named @', async () => {
    const { exec, calls } = makeExecRecorder('@');
    const creator = new PrCreator(
      { targetBranch: 'main', disabled: false, remote: 'origin' },
      exec,
    );

    const result = await creator.create(makeResult());

    expect(result).toEqual({ url: 'https://example.com/pr/1' });
    const push = calls.find(c => c.command === 'git' && c.args.includes('push'));
    expect(push!.args).toEqual([
      'push', 'origin', 'refs/heads/@:refs/heads/@',
    ]);
  });

  // Codex round-2 P3: a remote may be a repository URL, which legitimately
  // contains ':' and '//'. These must be accepted (argv removes shell meaning).
  it.each([
    'git@github.com:djm204/frankenbeast.git',
    'https://github.com/djm204/frankenbeast.git',
    'ssh://git@example.com:22/repo.git',
  ])('accepts repository URL %s as a push remote', async (remote) => {
    const { exec, calls } = makeExecRecorder('feature/foo');
    const creator = new PrCreator(
      { targetBranch: 'main', disabled: false, remote },
      exec,
    );

    const result = await creator.create(makeResult());

    expect(result).toEqual({ url: 'https://example.com/pr/1' });
    const push = calls.find(c => c.command === 'git' && c.args.includes('push'));
    expect(push!.args).toEqual([
      'push', remote, 'refs/heads/feature/foo:refs/heads/feature/foo',
    ]);
  });

  // Codex round-4 P2: git runs a transport-helper command for remotes of the
  // form `<transport>::<address>` (e.g. `ext::`, `fd::`). A config-derived value
  // of this shape is a command-injection vector and must be rejected, while
  // legitimate URL/named remotes (no `::`) keep working.
  it.each([
    "ext::sh -c 'touch pwned'",
    'ext::git-upload-pack /evil',
    'fd::17',
  ])('refuses to run for a transport-helper remote %s', async (remote) => {
    const { exec, calls } = makeExecRecorder('feature/foo');
    const creator = new PrCreator(
      { targetBranch: 'main', disabled: false, remote },
      exec,
    );

    const result = await creator.create(makeResult());

    expect(result).toBeNull();
    expect(calls.some(c => c.args.includes('push'))).toBe(false);
  });

  it('still rejects an option-injecting remote', async () => {
    const { exec, calls } = makeExecRecorder('feature/foo');
    const creator = new PrCreator(
      { targetBranch: 'main', disabled: false, remote: '--upload-pack=evil' },
      exec,
    );

    const result = await creator.create(makeResult());

    expect(result).toBeNull();
    expect(calls.some(c => c.args.includes('push'))).toBe(false);
  });

  it('accepts a base branch containing valid ref characters', async () => {
    const { exec, calls } = makeExecRecorder('feature/work');
    const creator = new PrCreator(
      { targetBranch: 'release/v1.0+stable', disabled: false, remote: 'origin' },
      exec,
    );

    const result = await creator.create(makeResult());

    expect(result).toEqual({ url: 'https://example.com/pr/1' });
    const create = calls.find(c => c.command === 'gh' && c.args.includes('create'));
    expect(create!.args.slice(0, 4)).toEqual(['pr', 'create', '--base', 'release/v1.0+stable']);
  });

  it('surfaces gh authentication failures as actionable required-action errors', async () => {
    const calls: ExecCall[] = [];
    const exec = (command: string, args: readonly string[] = []): string => {
      calls.push({ command, args });
      if (args.includes('--show-current')) return 'feature/auth-warning\n';
      if (command === 'gh' && args.includes('list')) return '[]';
      if (command === 'gh' && args.includes('create')) {
        const error = new Error('Command failed: gh pr create') as Error & { stderr: string; status: number };
        error.stderr = 'To get started with GitHub CLI, please run: gh auth login';
        error.status = 4;
        throw error;
      }
      return '';
    };
    const creator = new PrCreator(
      { targetBranch: 'main', disabled: false, remote: 'origin' },
      exec,
    );

    await expect(creator.create(makeResult())).rejects.toMatchObject({
      name: PrCreationRequiredActionError.name,
      message: expect.stringContaining('gh auth login'),
      branch: 'feature/auth-warning',
    });
    expect(calls.some(c => c.command === 'git' && c.args.includes('push'))).toBe(true);
  });

  it('surfaces GitHub Actions GH_TOKEN auth failures as actionable required-action errors', async () => {
    const calls: ExecCall[] = [];
    const exec = (command: string, args: readonly string[] = []): string => {
      calls.push({ command, args });
      if (args.includes('--show-current')) return 'feature/actions-auth-warning\n';
      if (command === 'gh' && args.includes('list')) {
        const error = new Error('Command failed: gh pr list') as Error & { stderr: string; status: number };
        error.stderr = 'gh: To use GitHub CLI in a GitHub Actions workflow, set the GH_TOKEN environment variable';
        error.status = 4;
        throw error;
      }
      return '';
    };
    const creator = new PrCreator(
      { targetBranch: 'main', disabled: false, remote: 'origin' },
      exec,
    );

    await expect(creator.create(makeResult())).rejects.toMatchObject({
      name: PrCreationRequiredActionError.name,
      message: expect.stringContaining('GH_TOKEN'),
      action: expect.stringContaining('GH_TOKEN'),
      branch: 'feature/actions-auth-warning',
    });
    expect(calls.some(c => c.command === 'git' && c.args.includes('push'))).toBe(true);
  });

  it('surfaces GitHub integration permission failures as actionable required-action errors', async () => {
    const calls: ExecCall[] = [];
    const exec = (command: string, args: readonly string[] = []): string => {
      calls.push({ command, args });
      if (args.includes('--show-current')) return 'feature/integration-auth-warning\n';
      if (command === 'gh' && args.includes('create')) {
        const error = new Error('Command failed: gh pr create') as Error & { stderr: string; status: number };
        error.stderr = 'GraphQL: Resource not accessible by integration';
        error.status = 4;
        throw error;
      }
      if (command === 'gh' && args.includes('list')) return '[]';
      return '';
    };
    const creator = new PrCreator(
      { targetBranch: 'main', disabled: false, remote: 'origin' },
      exec,
    );

    await expect(creator.create(makeResult())).rejects.toMatchObject({
      name: PrCreationRequiredActionError.name,
      message: expect.stringContaining('pull-request permissions'),
      action: expect.stringContaining('pull-request permissions'),
      branch: 'feature/integration-auth-warning',
    });
    expect(calls.some(c => c.command === 'git' && c.args.includes('push'))).toBe(true);
  });

  it('does not misclassify generic gh 403 rate-limit failures as auth-required', async () => {
    const calls: ExecCall[] = [];
    const exec = (command: string, args: readonly string[] = []): string => {
      calls.push({ command, args });
      if (args.includes('--show-current')) return 'feature/rate-limited\n';
      if (command === 'gh' && args.includes('create')) {
        const error = new Error('Command failed: gh pr create') as Error & { stderr: string; status: number };
        error.stderr = 'HTTP 403: API rate limit exceeded for user';
        error.status = 4;
        throw error;
      }
      if (command === 'gh' && args.includes('list')) return '[]';
      return '';
    };
    const creator = new PrCreator(
      { targetBranch: 'main', disabled: false, remote: 'origin' },
      exec,
    );

    await expect(creator.create(makeResult())).resolves.toBeNull();
    expect(calls.some(c => c.command === 'git' && c.args.includes('push'))).toBe(true);
  });

  it('surfaces GitHub Actions PR-creation permission failures as actionable required-action errors', async () => {
    const calls: ExecCall[] = [];
    const exec = (command: string, args: readonly string[] = []): string => {
      calls.push({ command, args });
      if (args.includes('--show-current')) return 'feature/actions-pr-permission\n';
      if (command === 'gh' && args.includes('create')) {
        const error = new Error('Command failed: gh pr create') as Error & { stderr: string; status: number };
        error.stderr = 'GitHub Actions is not permitted to create or approve pull requests';
        error.status = 4;
        throw error;
      }
      if (command === 'gh' && args.includes('list')) return '[]';
      return '';
    };
    const creator = new PrCreator(
      { targetBranch: 'main', disabled: false, remote: 'origin' },
      exec,
    );

    await expect(creator.create(makeResult())).rejects.toMatchObject({
      name: PrCreationRequiredActionError.name,
      message: expect.stringContaining('pull-request permissions'),
      action: expect.stringContaining('pull-request permissions'),
      branch: 'feature/actions-pr-permission',
    });
    expect(calls.some(c => c.command === 'git' && c.args.includes('push'))).toBe(true);
  });

  it('surfaces fine-grained PAT permission failures as actionable required-action errors', async () => {
    const calls: ExecCall[] = [];
    const exec = (command: string, args: readonly string[] = []): string => {
      calls.push({ command, args });
      if (args.includes('--show-current')) return 'feature/pat-permission\n';
      if (command === 'gh' && args.includes('create')) {
        const error = new Error('Command failed: gh pr create') as Error & { stderr: string; status: number };
        error.stderr = 'GraphQL: Resource not accessible by personal access token';
        error.status = 4;
        throw error;
      }
      if (command === 'gh' && args.includes('list')) return '[]';
      return '';
    };
    const creator = new PrCreator(
      { targetBranch: 'main', disabled: false, remote: 'origin' },
      exec,
    );

    await expect(creator.create(makeResult())).rejects.toMatchObject({
      name: PrCreationRequiredActionError.name,
      message: expect.stringContaining('pull-request permissions'),
      action: expect.stringContaining('pull-request permissions'),
      branch: 'feature/pat-permission',
    });
    expect(calls.some(c => c.command === 'git' && c.args.includes('push'))).toBe(true);
  });

  // Argument-injection and invalid-ref guards must still hold.
  it.each([
    '-evil',
    'foo..bar',
    'foo~1',
    'foo^bar',
    'foo:bar',
    'foo bar',
    'foo@{0}',
    'foo/',
    '/foo',
    'foo//bar',
    'foo.lock',
  ])('refuses to run for invalid/unsafe ref %s', async (branch: string) => {
    const { exec, calls } = makeExecRecorder(branch);
    const creator = new PrCreator(
      { targetBranch: 'main', disabled: false, remote: 'origin' },
      exec,
    );

    const result = await creator.create(makeResult());

    expect(result).toBeNull();
    expect(calls.some(c => c.args.includes('push'))).toBe(false);
    expect(calls.some(c => c.command === 'gh')).toBe(false);
  });
});
