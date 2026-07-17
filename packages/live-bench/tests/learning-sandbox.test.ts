import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
        expect(() => writeFileSync(join(sandbox.workspaceDir, 'new-file.txt'), 'mutate\n', 'utf8')).toThrow();
        return { passed: true, evidence: ['read fixture clone', 'direct writes rejected'] };
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
      outcomeEvidence: ['read fixture clone', 'direct writes rejected'],
    });
  });

  it('denies mutation-capable tools before their handlers can touch repos, memory, approvals, or GitHub state', async () => {
    const { fixturesRoot, fixtureDir } = createFixturesRoot();
    const runsRoot = tempRoot('learning-sandbox-runs-');
    const attempts = ['write_file', 'memory', 'approval_ledger_write', 'github_issue_comment', 'terminal', 'kanban_complete'];
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
          })).rejects.toThrow(/not allowed in learning sandbox policy/);
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
});
