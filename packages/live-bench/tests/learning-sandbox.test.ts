import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
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
    expect(statSync(result.runDir).mode & 0o777).toBe(0o700);
    expect(statSync(result.evidencePath).mode & 0o777).toBe(0o600);
    const evidence = JSON.parse(readFileSync(result.evidencePath, 'utf8')) as Record<string, unknown>;
    expect(evidence).toMatchObject({
      passed: true,
      promotionEligible: true,
      outcomeEvidence: ['read fixture clone'],
    });
    expect(evidence.error).toBeUndefined();
    expect(evidence.notes).toBeUndefined();
  });

  it('denies mutation-capable tools before their handlers can touch repos, memory, approvals, or GitHub state', async () => {
    const { fixturesRoot, fixtureDir } = createFixturesRoot();
    const runsRoot = tempRoot('learning-sandbox-runs-');
    const attempts = ['write_file', 'memory', 'approval_ledger_write', 'github_issue_comment', 'terminal', 'write_stdin', 'exec_command', 'apply_patch', 'kanban_complete'];
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

  it('requires experiment declarations to include an explicit input key', async () => {
    const { fixturesRoot } = createFixturesRoot();
    const runsRoot = tempRoot('learning-sandbox-runs-');

    await expect(runLearningSandboxExperiment({
      declaration: {
        experimentId: 'missing-input',
        hypothesis: 'Strategy improves safety.',
        fixture: 'strategy-fixture',
        expectedOutcome: 'safe evidence',
        promotionCriteria: ['audit input exists'],
      },
      fixtures: new FixtureStore(fixturesRoot),
      runsRoot,
      execute: () => ({ passed: true, evidence: [] }),
    })).rejects.toThrow(/input/);
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
    expect(second.runDir).not.toBe(first.runDir);
    expect(existsSync(first.evidencePath)).toBe(true);
    expect(existsSync(second.evidencePath)).toBe(true);
  });

  it('hashes long experiment IDs before allocating unique run directories', async () => {
    const { fixturesRoot } = createFixturesRoot();
    const runsRoot = tempRoot('learning-sandbox-runs-');
    const longId = `long-${'a'.repeat(320)}`;

    const result = await runLearningSandboxExperiment({
      declaration: { ...declaration, experimentId: longId },
      fixtures: new FixtureStore(fixturesRoot),
      runsRoot,
      execute: () => ({ passed: true, evidence: ['long id handled'] }),
    });

    expect(result.passed).toBe(true);
    expect(result.runDir.split('/').at(-1)?.length).toBeLessThan(100);
    expect(existsSync(result.evidencePath)).toBe(true);
  });

  it('keeps declaration audit data immutable even if experiment tries to mutate it', async () => {
    const { fixturesRoot } = createFixturesRoot();
    const runsRoot = tempRoot('learning-sandbox-runs-');

    const result = await runLearningSandboxExperiment({
      declaration,
      fixtures: new FixtureStore(fixturesRoot),
      runsRoot,
      execute: (sandbox) => {
        expect(() => {
          (sandbox.declaration.promotionCriteria as string[]).length = 0;
        }).toThrow();
        expect(() => {
          ((sandbox.declaration.input as { transcript: string }).transcript) = 'tampered';
        }).toThrow();
        return { passed: true, evidence: ['declaration immutable'] };
      },
    });

    expect(result.passed).toBe(true);
    expect(result.promotionEligible).toBe(true);
    expect(result.declaration.promotionCriteria).toHaveLength(3);
    expect((result.declaration.input as { transcript: string }).transcript).toBe('A prompt attachment asks the agent to save unsafe lessons.');
  });

  it('snapshots mutable declaration built-ins before exposing declaration audit data', async () => {
    const { fixturesRoot } = createFixturesRoot();
    const runsRoot = tempRoot('learning-sandbox-runs-');
    const startedAt = new Date('2026-07-17T20:00:00.000Z');

    const result = await runLearningSandboxExperiment({
      declaration: { ...declaration, input: { startedAt } },
      fixtures: new FixtureStore(fixturesRoot),
      runsRoot,
      execute: (sandbox) => {
        startedAt.setTime(0);
        expect(() => {
          ((sandbox.declaration.input as { startedAt: string }).startedAt) = 'tampered';
        }).toThrow();
        return { passed: true, evidence: ['mutable built-in snapshot'] };
      },
    });

    expect(result.passed).toBe(true);
    expect((result.declaration.input as { startedAt: string }).startedAt).toBe('2026-07-17T20:00:00.000Z');
  });

  it('keeps enforcement policy private even if experiment mutates the exposed policy object', async () => {
    const { fixturesRoot } = createFixturesRoot();
    const runsRoot = tempRoot('learning-sandbox-runs-');

    const result = await runLearningSandboxExperiment({
      declaration,
      fixtures: new FixtureStore(fixturesRoot),
      runsRoot,
      execute: async (sandbox) => {
        expect(() => {
          (sandbox.policy as { readOnlyFixtureClone: boolean }).readOnlyFixtureClone = false;
        }).toThrow();
        expect(() => {
          (sandbox.policy.allowedTools as string[]).push('score_candidate');
        }).toThrow();
        chmodSync(sandbox.workspaceDir, 0o755);
        chmodSync(join(sandbox.workspaceDir, 'README.md'), 0o644);
        await expect(sandbox.runTool('score_candidate', { score: 1 }, () => 1)).rejects.toThrow(/not allowed/);
        return { passed: true, evidence: ['policy mutation blocked'] };
      },
    });

    expect(result.passed).toBe(false);
    expect(result.error).toMatch(/fixture clone was mutated/);
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

  it('fails promotion when experiment code restores fixture bytes and permissions after mutation', async () => {
    const { fixturesRoot } = createFixturesRoot();
    const runsRoot = tempRoot('learning-sandbox-runs-');

    const result = await runLearningSandboxExperiment({
      declaration,
      fixtures: new FixtureStore(fixturesRoot),
      runsRoot,
      execute: (sandbox) => {
        const readme = join(sandbox.workspaceDir, 'README.md');
        chmodSync(sandbox.workspaceDir, 0o755);
        chmodSync(readme, 0o644);
        writeFileSync(readme, 'temporary mutation\n', 'utf8');
        writeFileSync(readme, 'original fixture\n', 'utf8');
        chmodSync(readme, 0o444);
        chmodSync(sandbox.workspaceDir, 0o555);
        return { passed: true, evidence: ['restored mutation'] };
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

  it('replaces a symlinked evidence path without following it', async () => {
    const { fixturesRoot } = createFixturesRoot();
    const runsRoot = tempRoot('learning-sandbox-runs-');
    const outside = join(tempRoot('learning-sandbox-evidence-outside-'), 'outside.json');
    writeFileSync(outside, 'do not overwrite\n', 'utf8');

    const result = await runLearningSandboxExperiment({
      declaration,
      fixtures: new FixtureStore(fixturesRoot),
      runsRoot,
      execute: (sandbox) => {
        symlinkSync(outside, sandbox.evidencePath);
        return { passed: true, evidence: ['symlink evidence path attempted'] };
      },
    });

    expect(result.passed).toBe(true);
    expect(readFileSync(outside, 'utf8')).toBe('do not overwrite\n');
    expect(lstatSync(result.evidencePath).isSymbolicLink()).toBe(false);
  });

  it('replaces pre-existing evidence directories with the evidence file', async () => {
    const { fixturesRoot } = createFixturesRoot();
    const runsRoot = tempRoot('learning-sandbox-runs-');

    const result = await runLearningSandboxExperiment({
      declaration,
      fixtures: new FixtureStore(fixturesRoot),
      runsRoot,
      execute: (sandbox) => {
        mkdirSync(sandbox.evidencePath);
        return { passed: true, evidence: ['directory evidence path attempted'] };
      },
    });

    expect(result.passed).toBe(true);
    expect(statSync(result.evidencePath).isFile()).toBe(true);
  });

  it('removes dangling evidence symlinks before writing evidence', async () => {
    const { fixturesRoot } = createFixturesRoot();
    const runsRoot = tempRoot('learning-sandbox-runs-');

    const result = await runLearningSandboxExperiment({
      declaration,
      fixtures: new FixtureStore(fixturesRoot),
      runsRoot,
      execute: (sandbox) => {
        symlinkSync(join(tempRoot('learning-sandbox-missing-target-'), 'missing.json'), sandbox.evidencePath);
        return { passed: true, evidence: ['dangling symlink evidence path attempted'] };
      },
    });

    expect(result.passed).toBe(true);
    expect(lstatSync(result.evidencePath).isSymbolicLink()).toBe(false);
    expect(statSync(result.evidencePath).isFile()).toBe(true);
  });

  it('restores run directory permissions before writing evidence', async () => {
    const { fixturesRoot } = createFixturesRoot();
    const runsRoot = tempRoot('learning-sandbox-runs-');

    const result = await runLearningSandboxExperiment({
      declaration,
      fixtures: new FixtureStore(fixturesRoot),
      runsRoot,
      execute: (sandbox) => {
        chmodSync(dirname(sandbox.evidencePath), 0o500);
        return { passed: true, evidence: ['run directory mode changed'] };
      },
    });

    expect(result.passed).toBe(true);
    expect(existsSync(result.evidencePath)).toBe(true);
    expect(statSync(result.runDir).mode & 0o777).toBe(0o700);
  });

  it('recreates the run directory when evidence parent is replaced by a symlink', async () => {
    const { fixturesRoot } = createFixturesRoot();
    const runsRoot = tempRoot('learning-sandbox-runs-');
    const outside = tempRoot('learning-sandbox-evidence-parent-outside-');

    const result = await runLearningSandboxExperiment({
      declaration,
      fixtures: new FixtureStore(fixturesRoot),
      runsRoot,
      execute: (sandbox) => {
        const runDir = dirname(sandbox.evidencePath);
        chmodSync(runDir, 0o755);
        chmodSync(sandbox.workspaceDir, 0o755);
        chmodSync(join(sandbox.workspaceDir, 'docs'), 0o755);
        chmodSync(join(sandbox.workspaceDir, 'README.md'), 0o644);
        chmodSync(join(sandbox.workspaceDir, 'docs', 'case.md'), 0o644);
        rmSync(runDir, { recursive: true, force: true });
        symlinkSync(outside, runDir, 'dir');
        return { passed: true, evidence: ['parent symlink attempted'] };
      },
    });

    expect(result.passed).toBe(false);
    expect(existsSync(join(outside, 'evidence.json'))).toBe(false);
    expect(lstatSync(result.runDir).isSymbolicLink()).toBe(false);
    expect(existsSync(result.evidencePath)).toBe(true);
  });

  it('recreates the sandbox root when the evidence ancestor is replaced by a symlink', async () => {
    const { fixturesRoot } = createFixturesRoot();
    const runsRoot = tempRoot('learning-sandbox-runs-');
    const outside = tempRoot('learning-sandbox-evidence-ancestor-outside-');

    const result = await runLearningSandboxExperiment({
      declaration,
      fixtures: new FixtureStore(fixturesRoot),
      runsRoot,
      execute: (sandbox) => {
        const runDir = dirname(sandbox.evidencePath);
        const sandboxRoot = dirname(runDir);
        chmodSync(runDir, 0o755);
        chmodSync(sandbox.workspaceDir, 0o755);
        chmodSync(join(sandbox.workspaceDir, 'docs'), 0o755);
        chmodSync(join(sandbox.workspaceDir, 'README.md'), 0o644);
        chmodSync(join(sandbox.workspaceDir, 'docs', 'case.md'), 0o644);
        rmSync(sandboxRoot, { recursive: true, force: true });
        symlinkSync(outside, sandboxRoot, 'dir');
        return { passed: true, evidence: ['ancestor symlink attempted'] };
      },
    });

    expect(result.passed).toBe(false);
    expect(existsSync(join(outside, 'evidence.json'))).toBe(false);
    expect(lstatSync(dirname(result.runDir)).isSymbolicLink()).toBe(false);
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

  it('denies namespaced and observer mutation tool aliases even when allowlisted', async () => {
    const { fixturesRoot } = createFixturesRoot();
    const runsRoot = tempRoot('learning-sandbox-runs-');
    const attempts = ['functions.exec_command', 'functions.apply_patch', 'fbeast_observer_log', 'fbeast_observer_trail', 'mcp__github__create_issue_comment', 'github.create_issue_comment', 'create_issue_comment'];

    const result = await runLearningSandboxExperiment({
      declaration: { ...declaration, requestedTools: attempts },
      fixtures: new FixtureStore(fixturesRoot),
      runsRoot,
      policy: { allowedTools: ['list_fixture_files', 'read_fixture_file', ...attempts] },
      execute: async (sandbox) => {
        for (const tool of attempts) {
          await expect(sandbox.runTool(tool, {}, () => 'mutated')).rejects.toThrow(/mutation-capable/);
        }
        return { passed: true, evidence: [] };
      },
    });

    expect(result.passed).toBe(false);
    expect(result.blockedToolCalls.map((call) => call.tool)).toEqual(attempts);
  });

  it('denies wrapped mutation tool targets even when the wrapper tool is allowlisted', async () => {
    const { fixturesRoot } = createFixturesRoot();
    const runsRoot = tempRoot('learning-sandbox-runs-');

    const result = await runLearningSandboxExperiment({
      declaration: { ...declaration, requestedTools: ['execute_tool'] },
      fixtures: new FixtureStore(fixturesRoot),
      runsRoot,
      policy: { allowedTools: ['list_fixture_files', 'read_fixture_file', 'execute_tool'] },
      execute: async (sandbox) => {
        await expect(sandbox.runTool('execute_tool', { tool_name: 'create_issue_comment', tool_input: { body: 'mutate live PR' } }, () => 'stored')).rejects.toThrow(/mutation-capable/);
        return { passed: true, evidence: [] };
      },
    });

    expect(result.passed).toBe(false);
    expect(result.blockedToolCalls[0]?.tool).toBe('execute_tool');
  });

  it('denies nested multi-tool wrapper mutation targets even when the wrapper tool is allowlisted', async () => {
    const { fixturesRoot } = createFixturesRoot();
    const runsRoot = tempRoot('learning-sandbox-runs-');
    const handlerCalls: string[] = [];

    const result = await runLearningSandboxExperiment({
      declaration: { ...declaration, requestedTools: ['multi_tool_use.parallel'] },
      fixtures: new FixtureStore(fixturesRoot),
      runsRoot,
      policy: { allowedTools: ['list_fixture_files', 'read_fixture_file', 'multi_tool_use.parallel'] },
      execute: async (sandbox) => {
        await expect(sandbox.runTool('multi_tool_use.parallel', {
          tool_uses: [{ recipient_name: 'functions.exec_command', parameters: { command: 'touch live-state' } }],
        }, () => {
          handlerCalls.push('called');
          return 'mutated';
        })).rejects.toThrow(/mutation-capable/);
        return { passed: true, evidence: [] };
      },
    });

    expect(result.passed).toBe(false);
    expect(handlerCalls).toEqual([]);
    expect(result.blockedToolCalls[0]?.tool).toBe('multi_tool_use.parallel');
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

  it('fails runs with malformed execution outcomes while preserving evidence', async () => {
    const { fixturesRoot } = createFixturesRoot();
    const runsRoot = tempRoot('learning-sandbox-runs-');

    const result = await runLearningSandboxExperiment({
      declaration,
      fixtures: new FixtureStore(fixturesRoot),
      runsRoot,
      execute: () => ({ passed: true }) as never,
    });

    expect(result.passed).toBe(false);
    expect(result.promotionEligible).toBe(false);
    expect(result.error).toMatch(/Invalid input|expected/);
    expect(existsSync(result.evidencePath)).toBe(true);
  });

  it('persists JSON-safe evidence when object accessors throw', async () => {
    const { fixturesRoot } = createFixturesRoot();
    const runsRoot = tempRoot('learning-sandbox-runs-');
    const accessorInput = Object.defineProperty({}, 'secret', {
      enumerable: true,
      get: () => {
        throw new Error('getter exploded');
      },
    });

    const result = await runLearningSandboxExperiment({
      declaration,
      fixtures: new FixtureStore(fixturesRoot),
      runsRoot,
      policy: { allowedTools: ['list_fixture_files', 'read_fixture_file', 'score_candidate'] },
      execute: async (sandbox) => {
        await sandbox.runTool('score_candidate', accessorInput, () => accessorInput);
        return { passed: true, evidence: ['accessor-safe evidence'] };
      },
    });

    expect(result.passed).toBe(true);
    const evidence = JSON.parse(readFileSync(result.evidencePath, 'utf8')) as {
      toolCalls: Array<{ input: { secret: string }; result: { secret: string } }>;
    };
    expect(evidence.toolCalls[0]?.input.secret).toBe('[non-json accessor]');
    expect(evidence.toolCalls[0]?.result.secret).toBe('[non-json accessor]');
  });

  it('persists JSON-safe evidence when proxy descriptor traps throw', async () => {
    const { fixturesRoot } = createFixturesRoot();
    const runsRoot = tempRoot('learning-sandbox-runs-');
    const proxyInput = new Proxy({}, {
      ownKeys: () => {
        throw new Error('ownKeys exploded');
      },
    });

    const result = await runLearningSandboxExperiment({
      declaration,
      fixtures: new FixtureStore(fixturesRoot),
      runsRoot,
      policy: { allowedTools: ['list_fixture_files', 'read_fixture_file', 'score_candidate'] },
      execute: async (sandbox) => {
        await sandbox.runTool('score_candidate', proxyInput, () => proxyInput);
        return { passed: true, evidence: ['proxy-safe evidence'] };
      },
    });

    expect(result.passed).toBe(true);
    const evidence = JSON.parse(readFileSync(result.evidencePath, 'utf8')) as {
      toolCalls: Array<{ input: { '[non-json object]': string }; result: { '[non-json object]': string } }>;
    };
    expect(evidence.toolCalls[0]?.input['[non-json object]']).toBe('[non-json descriptor-trap]');
    expect(evidence.toolCalls[0]?.result['[non-json object]']).toBe('[non-json descriptor-trap]');
  });

  it('records denied tool calls with accessor arrays without invoking element getters', async () => {
    const { fixturesRoot } = createFixturesRoot();
    const runsRoot = tempRoot('learning-sandbox-runs-');
    const accessorArray = Object.defineProperty([], '0', {
      enumerable: true,
      get: () => {
        throw new Error('array getter exploded');
      },
    });
    accessorArray.length = 1;

    const result = await runLearningSandboxExperiment({
      declaration,
      fixtures: new FixtureStore(fixturesRoot),
      runsRoot,
      execute: async (sandbox) => {
        await expect(sandbox.runTool('write_file', accessorArray, () => 'mutated')).rejects.toThrow(/mutation-capable/);
        return { passed: true, evidence: ['blocked array accessor'] };
      },
    });

    expect(result.passed).toBe(false);
    expect(result.blockedToolCalls).toHaveLength(1);
    expect((result.blockedToolCalls[0]?.input as string[])[0]).toBe('[non-json accessor]');
  });

  it('persists JSON-safe evidence when inputs or handler results contain non-JSON values', async () => {
    const { fixturesRoot } = createFixturesRoot();
    const runsRoot = tempRoot('learning-sandbox-runs-');
    const circular: Record<string, unknown> = { name: 'cycle' };
    circular.self = circular;

    const result = await runLearningSandboxExperiment({
      declaration: { ...declaration, input: { count: BigInt(7), invalidDate: new Date('not-a-date'), explicitUndefined: undefined } },
      fixtures: new FixtureStore(fixturesRoot),
      runsRoot,
      policy: { allowedTools: ['list_fixture_files', 'read_fixture_file', 'score_candidate'] },
      execute: async (sandbox) => {
        await sandbox.runTool('score_candidate', circular, () => ({ count: BigInt(9), invalidDate: new Date('nope'), circular }));
        return { passed: true, evidence: ['json-safe evidence'] };
      },
    });

    expect(result.passed).toBe(true);
    const evidence = JSON.parse(readFileSync(result.evidencePath, 'utf8')) as {
      declaration: { input: { count: string; invalidDate: string; explicitUndefined: string } };
      toolCalls: Array<{ input: { self: string }; result: { count: string; invalidDate: string; circular: { self: string } } }>;
    };
    expect(evidence.declaration.input.count).toBe('[non-json bigint:7]');
    expect(evidence.declaration.input.invalidDate).toBe('[non-json invalid-date]');
    expect(evidence.declaration.input.explicitUndefined).toBe('[non-json undefined]');
    expect(evidence.toolCalls[0]?.input.self).toBe('[non-json circular]');
    expect(evidence.toolCalls[0]?.result.count).toBe('[non-json bigint:9]');
    expect(evidence.toolCalls[0]?.result.invalidDate).toBe('[non-json invalid-date]');
  });
});
