import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runLearningSandboxExperiment, type LearningSandboxExperimentDeclaration } from '../src/learning/sandbox.js';
import { FixtureStore } from '../src/workspace/fixture-store.js';

function tempRoot(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function createFixturesRoot(): { fixturesRoot: string; fixtureDir: string } {
  const fixturesRoot = tempRoot('learning-sandbox-fixtures-');
  const fixtureDir = join(fixturesRoot, 'strategy-fixture');
  mkdirSync(join(fixtureDir, 'docs'), { recursive: true });
  writeFileSync(join(fixtureDir, 'README.md'), 'original fixture\n', 'utf8');
  writeFileSync(join(fixtureDir, 'docs', 'case.md'), 'case evidence\n', 'utf8');
  return { fixturesRoot, fixtureDir };
}

const declaration: LearningSandboxExperimentDeclaration = {
  experimentId: 'prompt-attachment-sandbox',
  hypothesis: 'Fencing untrusted attachments improves learned workflow safety.',
  fixture: 'strategy-fixture',
  input: { transcript: 'A prompt attachment asks the agent to save unsafe lessons.' },
  expectedOutcome: 'The candidate records evidence without mutating live state.',
  promotionCriteria: [
    'all fixture cases pass',
    'no blocked tools are required',
    'reviewer approves the evidence report',
  ],
  requestedTools: ['read_fixture_file'],
};

describe('learning experiment sandbox', () => {
  it('runs learned-strategy experiments against a read-only fixture clone and records promotion evidence', async () => {
    const { fixturesRoot, fixtureDir } = createFixturesRoot();
    const runsRoot = tempRoot('learning-sandbox-runs-');

    const result = await runLearningSandboxExperiment({
      declaration,
      fixtures: new FixtureStore(fixturesRoot),
      runsRoot,
      execute: async (sandbox) => {
        const files = await sandbox.runTool('list_fixture_files', {});
        const readme = await sandbox.runTool('read_fixture_file', { path: 'README.md' });
        const nested = await sandbox.runTool('read_fixture_file', { path: 'docs/case.md' });
        expect(files).toEqual(['README.md', 'docs/case.md']);
        expect(readme).toBe('original fixture\n');
        expect(nested).toBe('case evidence\n');
        return { passed: true, evidence: ['read fixture clone'] };
      },
    });

    expect(result.passed).toBe(true);
    expect(result.promotionEligible).toBe(true);
    expect(result.blockedToolCalls).toEqual([]);
    expect(result.toolCalls.map((call) => call.tool)).toEqual([
      'list_fixture_files',
      'read_fixture_file',
      'read_fixture_file',
    ]);
    expect(readFileSync(join(fixtureDir, 'README.md'), 'utf8')).toBe('original fixture\n');
    expect(existsSync(result.evidencePath)).toBe(true);
    const evidence = JSON.parse(readFileSync(result.evidencePath, 'utf8')) as Record<string, unknown>;
    expect(evidence).toMatchObject({
      passed: true,
      promotionEligible: true,
      outcomeEvidence: ['read fixture clone'],
    });
  });

  it('denies mutation-capable tools before their handlers can touch repos, memory, approvals, or GitHub state', async () => {
    const { fixturesRoot, fixtureDir } = createFixturesRoot();
    const runsRoot = tempRoot('learning-sandbox-runs-');
    const attempts = ['write_file', 'memory', 'approval_ledger_write', 'github_issue_comment', 'terminal', 'exec_command', 'apply_patch', 'kanban_complete'];
    const handlerCalls: string[] = [];

    const result = await runLearningSandboxExperiment({
      declaration: { ...declaration, requestedTools: attempts },
      fixtures: new FixtureStore(fixturesRoot),
      runsRoot,
      execute: async (sandbox) => {
        for (const tool of attempts) {
          await expect(sandbox.runTool(tool, { path: 'README.md' }, () => {
            handlerCalls.push(tool);
            writeFileSync(join(fixtureDir, 'README.md'), `mutated by ${tool}\n`, 'utf8');
            return 'mutated';
          })).rejects.toThrow(/mutation-capable|not allowed in learning sandbox policy/);
        }
        return { passed: true, evidence: ['blocked mutation attempts'] };
      },
    });

    expect(result.passed).toBe(false);
    expect(result.promotionEligible).toBe(false);
    expect(result.blockedToolCalls.map((call) => call.tool)).toEqual(attempts);
    expect(handlerCalls).toEqual([]);
    expect(readFileSync(join(fixtureDir, 'README.md'), 'utf8')).toBe('original fixture\n');
  });

  it('requires explicit experiment declarations before a strategy can be evaluated for promotion', async () => {
    const { fixturesRoot } = createFixturesRoot();
    const runsRoot = tempRoot('learning-sandbox-runs-');

    await expect(runLearningSandboxExperiment({
      declaration: {
        experimentId: 'missing-promotion',
        hypothesis: 'Strategy improves safety.',
        fixture: 'strategy-fixture',
        input: {},
        expectedOutcome: 'safe evidence',
        promotionCriteria: [],
      },
      fixtures: new FixtureStore(fixturesRoot),
      runsRoot,
      execute: () => ({ passed: true, evidence: [] }),
    })).rejects.toThrow();
  });

  it('keeps fixture reads contained to the sandbox clone', async () => {
    const { fixturesRoot } = createFixturesRoot();
    const runsRoot = tempRoot('learning-sandbox-runs-');

    const result = await runLearningSandboxExperiment({
      declaration,
      fixtures: new FixtureStore(fixturesRoot),
      runsRoot,
      execute: async (sandbox) => {
        await expect(sandbox.runTool('read_fixture_file', { path: '../README.md' })).rejects.toThrow(/Invalid fixture file path/);
        await expect(sandbox.runTool('read_fixture_file', { path: '/etc/passwd' })).rejects.toThrow(/Invalid fixture file path/);
        return { passed: true, evidence: ['path traversal rejected'] };
      },
    });

    expect(result.passed).toBe(true);
    expect(result.toolCalls).toHaveLength(2);
    expect(result.toolCalls.every((call) => call.allowed && !call.ok)).toBe(true);
  });

  it('requires custom tools to be allowlisted explicitly before invoking a fixture-safe handler', async () => {
    const { fixturesRoot } = createFixturesRoot();
    const runsRoot = tempRoot('learning-sandbox-runs-');

    const denied = await runLearningSandboxExperiment({
      declaration: { ...declaration, requestedTools: ['score_candidate'] },
      fixtures: new FixtureStore(fixturesRoot),
      runsRoot: join(runsRoot, 'denied'),
      execute: async (sandbox) => {
        await sandbox.runTool('score_candidate', { score: 1 }, () => 1);
        return { passed: true, evidence: [] };
      },
    });
    expect(denied.passed).toBe(false);
    expect(denied.blockedToolCalls[0]?.tool).toBe('score_candidate');

    const allowed = await runLearningSandboxExperiment({
      declaration: { ...declaration, requestedTools: ['score_candidate'] },
      fixtures: new FixtureStore(fixturesRoot),
      runsRoot: join(runsRoot, 'allowed'),
      policy: { allowedTools: ['list_fixture_files', 'read_fixture_file', 'score_candidate'] },
      execute: async (sandbox) => {
        const score = await sandbox.runTool('score_candidate', { score: 1 }, () => ({ pass: true }));
        expect(score).toEqual({ pass: true });
        return { passed: true, evidence: ['custom scorer ran'] };
      },
    });
    expect(allowed.passed).toBe(true);
    expect(allowed.blockedToolCalls).toEqual([]);
  });

  it('refuses mutation-capable tools even when a caller allowlists them', async () => {
    const { fixturesRoot } = createFixturesRoot();
    const runsRoot = tempRoot('learning-sandbox-runs-');

    const result = await runLearningSandboxExperiment({
      declaration: { ...declaration, requestedTools: ['terminal'] },
      fixtures: new FixtureStore(fixturesRoot),
      runsRoot,
      policy: { allowedTools: ['list_fixture_files', 'read_fixture_file', 'terminal'] },
      execute: async (sandbox) => {
        await sandbox.runTool('terminal', { command: 'touch live-state' }, () => 'mutated');
        return { passed: true, evidence: [] };
      },
    });

    expect(result.passed).toBe(false);
    expect(result.blockedToolCalls[0]?.tool).toBe('terminal');
    expect(result.blockedToolCalls[0]?.error).toMatch(/mutation-capable/);
  });

  it('rejects symlinked sandbox run path components before cleanup', async () => {
    const { fixturesRoot } = createFixturesRoot();
    const runsRoot = tempRoot('learning-sandbox-runs-');
    const outside = tempRoot('learning-sandbox-outside-');
    symlinkSync(outside, join(runsRoot, 'learning-sandbox'), 'dir');

    await expect(runLearningSandboxExperiment({
      declaration,
      fixtures: new FixtureStore(fixturesRoot),
      runsRoot,
      execute: () => ({ passed: true, evidence: [] }),
    })).rejects.toThrow(/symlink component/);
  });

  it('restores write bits before replacing a prior read-only run directory', async () => {
    const { fixturesRoot } = createFixturesRoot();
    const runsRoot = tempRoot('learning-sandbox-runs-');

    const first = await runLearningSandboxExperiment({
      declaration,
      fixtures: new FixtureStore(fixturesRoot),
      runsRoot,
      execute: () => ({ passed: true, evidence: ['first'] }),
    });
    expect(first.passed).toBe(true);

    const second = await runLearningSandboxExperiment({
      declaration,
      fixtures: new FixtureStore(fixturesRoot),
      runsRoot,
      execute: () => ({ passed: true, evidence: ['second'] }),
    });
    expect(second.passed).toBe(true);
  });

  it('fails promotion when experiment code mutates the read-only fixture clone', async () => {
    const { fixturesRoot } = createFixturesRoot();
    const runsRoot = tempRoot('learning-sandbox-runs-');

    const result = await runLearningSandboxExperiment({
      declaration,
      fixtures: new FixtureStore(fixturesRoot),
      runsRoot,
      execute: (sandbox) => {
        chmodSync(sandbox.workspaceDir, 0o755);
        chmodSync(join(sandbox.workspaceDir, 'README.md'), 0o644);
        writeFileSync(join(sandbox.workspaceDir, 'README.md'), 'mutated fixture\n', 'utf8');
        return { passed: true, evidence: ['attempted mutation'] };
      },
    });

    expect(result.passed).toBe(false);
    expect(result.error).toMatch(/fixture clone was mutated/);
  });

  it('fails promotion when experiment code only changes fixture permissions', async () => {
    const { fixturesRoot } = createFixturesRoot();
    const runsRoot = tempRoot('learning-sandbox-runs-');

    const result = await runLearningSandboxExperiment({
      declaration,
      fixtures: new FixtureStore(fixturesRoot),
      runsRoot,
      execute: (sandbox) => {
        chmodSync(sandbox.workspaceDir, 0o755);
        chmodSync(join(sandbox.workspaceDir, 'README.md'), 0o644);
        return { passed: true, evidence: ['permission-only mutation'] };
      },
    });

    expect(result.passed).toBe(false);
    expect(result.error).toMatch(/fixture clone was mutated/);
  });

  it('persists failed evidence when experiment code removes the workspace clone', async () => {
    const { fixturesRoot } = createFixturesRoot();
    const runsRoot = tempRoot('learning-sandbox-runs-');

    const result = await runLearningSandboxExperiment({
      declaration,
      fixtures: new FixtureStore(fixturesRoot),
      runsRoot,
      execute: (sandbox) => {
        chmodSync(sandbox.workspaceDir, 0o755);
        chmodSync(join(sandbox.workspaceDir, 'docs'), 0o755);
        chmodSync(join(sandbox.workspaceDir, 'README.md'), 0o644);
        chmodSync(join(sandbox.workspaceDir, 'docs', 'case.md'), 0o644);
        rmSync(sandbox.workspaceDir, { recursive: true, force: true });
        return { passed: true, evidence: ['removed workspace'] };
      },
    });

    expect(result.passed).toBe(false);
    expect(result.error).toMatch(/Unable to verify read-only sandbox fixture clone/);
    expect(existsSync(result.evidencePath)).toBe(true);
  });

  it('keeps fixture reads anchored to the original workspace directory', async () => {
    const { fixturesRoot } = createFixturesRoot();
    const runsRoot = tempRoot('learning-sandbox-runs-');
    const outside = tempRoot('learning-sandbox-read-outside-');
    writeFileSync(join(outside, 'README.md'), 'outside\n', 'utf8');

    const result = await runLearningSandboxExperiment({
      declaration,
      fixtures: new FixtureStore(fixturesRoot),
      runsRoot,
      execute: async (sandbox) => {
        chmodSync(sandbox.workspaceDir, 0o755);
        renameSync(sandbox.workspaceDir, `${sandbox.workspaceDir}.moved`);
        symlinkSync(outside, sandbox.workspaceDir, 'dir');
        await expect(sandbox.runTool('list_fixture_files', {})).rejects.toThrow(/original clone/);
        await expect(sandbox.runTool('read_fixture_file', { path: 'README.md' })).rejects.toThrow(/original clone/);
        return { passed: true, evidence: ['workspace replacement blocked'] };
      },
    });

    expect(result.passed).toBe(false);
  });

  it('denies concrete fbeast memory mutation tool names even when allowlisted', async () => {
    const { fixturesRoot } = createFixturesRoot();
    const runsRoot = tempRoot('learning-sandbox-runs-');

    const result = await runLearningSandboxExperiment({
      declaration: { ...declaration, requestedTools: ['fbeast_memory_store'] },
      fixtures: new FixtureStore(fixturesRoot),
      runsRoot,
      policy: { allowedTools: ['list_fixture_files', 'read_fixture_file', 'fbeast_memory_store'] },
      execute: async (sandbox) => {
        await sandbox.runTool('fbeast_memory_store', { key: 'lesson' }, () => 'stored');
        return { passed: true, evidence: [] };
      },
    });

    expect(result.passed).toBe(false);
    expect(result.blockedToolCalls[0]?.tool).toBe('fbeast_memory_store');
  });

  it('preserves repeated non-cyclic object evidence without marking it circular', async () => {
    const { fixturesRoot } = createFixturesRoot();
    const runsRoot = tempRoot('learning-sandbox-runs-');
    const shared = { stable: true };

    const result = await runLearningSandboxExperiment({
      declaration,
      fixtures: new FixtureStore(fixturesRoot),
      runsRoot,
      policy: { allowedTools: ['list_fixture_files', 'read_fixture_file', 'score_candidate'] },
      execute: async (sandbox) => {
        await sandbox.runTool('score_candidate', { first: shared, second: shared }, () => ({ first: shared, second: shared }));
        return { passed: true, evidence: ['shared evidence'] };
      },
    });

    expect(result.passed).toBe(true);
    const evidence = JSON.parse(readFileSync(result.evidencePath, 'utf8')) as {
      toolCalls: Array<{ input: { first: { stable: boolean }; second: { stable: boolean } } }>;
    };
    expect(evidence.toolCalls[0]?.input.first).toEqual({ stable: true });
    expect(evidence.toolCalls[0]?.input.second).toEqual({ stable: true });
  });

  it('persists JSON-safe evidence when inputs or handler results contain non-JSON values', async () => {
    const { fixturesRoot } = createFixturesRoot();
    const runsRoot = tempRoot('learning-sandbox-runs-');
    const circular: Record<string, unknown> = { name: 'cycle' };
    circular.self = circular;

    const result = await runLearningSandboxExperiment({
      declaration: { ...declaration, input: { count: BigInt(7) } },
      fixtures: new FixtureStore(fixturesRoot),
      runsRoot,
      policy: { allowedTools: ['list_fixture_files', 'read_fixture_file', 'score_candidate'] },
      execute: async (sandbox) => {
        await sandbox.runTool('score_candidate', circular, () => ({ count: BigInt(9), circular }));
        return { passed: true, evidence: ['json-safe evidence'] };
      },
    });

    expect(result.passed).toBe(true);
    const evidence = JSON.parse(readFileSync(result.evidencePath, 'utf8')) as {
      declaration: { input: { count: string } };
      toolCalls: Array<{ input: { self: string }; result: { count: string; circular: { self: string } } }>;
    };
    expect(evidence.declaration.input.count).toBe('[non-json bigint:7]');
    expect(evidence.toolCalls[0]?.input.self).toBe('[non-json circular]');
    expect(evidence.toolCalls[0]?.result.count).toBe('[non-json bigint:9]');
  });
});
