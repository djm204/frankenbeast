import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { loadCorpus, loadTaskFile } from '../src/corpus/loader.js';

function tempCorpus(): string {
  return mkdtempSync(join(tmpdir(), 'live-bench-corpus-'));
}

function writeTask(root: string, rel: string, task: unknown): string {
  const path = join(root, rel);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, JSON.stringify(task, null, 2), 'utf8');
  return path;
}

const validTask = {
  taskId: 'write-readme',
  tier: 'core',
  taskClass: 'artifact-critical',
  projectFixture: 'tiny-node',
  prompt: 'Create README.md with project summary.',
  expectedArtifacts: ['README.md'],
  requiredChecks: [{ type: 'file-exists', path: 'README.md' }],
  timeoutMs: 120000,
  allowedNondeterminism: [],
  baselineSupported: true,
};

describe('corpus loader', () => {
  it('loads and validates a task file', () => {
    const root = tempCorpus();
    const taskPath = writeTask(root, 'core/write-readme.task.json', validTask);

    expect(loadTaskFile(taskPath)).toMatchObject({
      taskId: 'write-readme',
      tier: 'core',
      requiredChecks: [{ type: 'file-exists', path: 'README.md' }],
    });
  });

  it('loads matching tiers sorted by task id without validating unselected tiers', () => {
    const root = tempCorpus();
    writeTask(root, 'candidate/z.task.json', { ...validTask, taskId: 'z-task', tier: 'candidate' });
    writeTask(root, 'core/a.task.json', { ...validTask, taskId: 'a-task' });
    writeTask(root, 'stress/bad.task.json', { ...validTask, taskId: 'bad-task', tier: 'stress', requiredChecks: [{ type: 'unknown-check' }] });

    expect(loadCorpus(root, ['core']).map((task) => task.taskId)).toEqual(['a-task']);
    expect(() => loadCorpus(root)).toThrow(/Invalid benchmark task/);
  });

  it('rejects invalid task fields with a helpful error', () => {
    const root = tempCorpus();
    const taskPath = writeTask(root, 'core/bad.task.json', {
      ...validTask,
      tier: 'invalid-tier',
      requiredChecks: [{ type: 'unknown-check', path: 'README.md' }],
    });

    expect(() => loadTaskFile(taskPath)).toThrow(/Invalid benchmark task/);
  });

  it('rejects unknown normalized task and check fields', () => {
    const root = tempCorpus();
    const taskPath = writeTask(root, 'core/unknown-fields.task.json', {
      ...validTask,
      obsolete_field: true,
      requiredChecks: [{ type: 'tool-call', tool: 'write_file', required_params: ['path'], obsolete_param: true }],
    });

    expect(() => loadTaskFile(taskPath)).toThrow(/Unrecognized key/);
  });

  it('rejects invalid JSON and invalid tiers before filtering selected corpus tiers', () => {
    const root = tempCorpus();
    const invalidJsonPath = join(root, 'candidate/bad-json.task.json');
    mkdirSync(join(invalidJsonPath, '..'), { recursive: true });
    writeFileSync(invalidJsonPath, '{not-json', 'utf8');
    writeTask(root, 'stress/bad-tier.task.json', { ...validTask, taskId: 'bad-tier', tier: 'cor' });

    expect(() => loadCorpus(root, ['core'])).toThrow(/Invalid benchmark task/);
  });

  it('rejects conflicting snake_case and camelCase aliases', () => {
    const root = tempCorpus();
    const taskPath = writeTask(root, 'core/conflict.task.json', {
      ...validTask,
      task_id: 'different-task',
    });

    expect(() => loadTaskFile(taskPath)).toThrow(/Conflicting benchmark aliases/);
  });

  it('rejects core tasks that are not fair baseline comparisons', () => {
    const root = tempCorpus();
    const taskPath = writeTask(root, 'core/fbeast-only.task.json', {
      ...validTask,
      taskId: 'fbeast-only',
      baselineSupported: false,
    });

    expect(() => loadTaskFile(taskPath)).toThrow(/core tasks must be baselineSupported/);
  });

  it('loads snake_case task files from the published benchmark contract', () => {
    const root = tempCorpus();
    const taskPath = writeTask(root, 'core/snake.task.json', {
      task_id: 'snake-task',
      tier: 'core',
      task_class: 'tool-critical',
      project_fixture: 'tiny-node',
      prompt: 'Create README.md with project summary.',
      expected_artifacts: ['README.md'],
      required_checks: [{ type: 'tool-call', tool: 'write_file', required_params: ['path', 'content'] }],
      timeout_ms: 120000,
      allowed_nondeterminism: [],
      baseline_supported: true,
    });

    expect(loadTaskFile(taskPath)).toMatchObject({
      taskId: 'snake-task',
      taskClass: 'tool-critical',
      projectFixture: 'tiny-node',
      requiredChecks: [{ type: 'tool-call', tool: 'write_file', requiredParams: ['path', 'content'] }],
    });
  });
});
