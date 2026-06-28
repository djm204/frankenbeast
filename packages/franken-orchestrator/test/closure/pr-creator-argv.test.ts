import { describe, it, expect } from 'vitest';
import { PrCreator } from '../../src/closure/pr-creator.js';
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
  ])('refuses to run for invalid/unsafe ref %s', async (branch) => {
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
