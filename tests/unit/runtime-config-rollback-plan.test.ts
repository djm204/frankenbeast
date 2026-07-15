import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it, afterEach } from 'vitest';

import {
  buildRuntimeConfigRollbackPlan,
  defaultEvidenceDir,
  diffRuntimeConfig,
  loadRuntimeConfigSnapshot,
} from '../../scripts/runtime-config-rollback-plan.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
const SCRIPT = resolve(ROOT, 'scripts/runtime-config-rollback-plan.mjs');

let workDir: string | undefined;

afterEach(async () => {
  if (workDir) {
    await rm(workDir, { recursive: true, force: true });
    workDir = undefined;
  }
});

describe('runtime config rollback plan dry-run helper', () => {
  it('diffs runtime config snapshots into deterministic JSON-pointer changes', () => {
    const before = {
      provider: 'claude',
      model: 'sonnet',
      modules: { planner: true, skills: true },
      skills: ['code-review'],
    };
    const after = {
      provider: 'openai',
      modules: { planner: false, memory: true, skills: true },
      skills: ['code-review', 'testing'],
    };

    expect(diffRuntimeConfig(before, after)).toEqual([
      { path: '/model', type: 'removed', before: 'sonnet' },
      { path: '/modules/memory', type: 'added', after: true },
      { path: '/modules/planner', type: 'changed', before: true, after: false },
      { path: '/provider', type: 'changed', before: 'claude', after: 'openai' },
      { path: '/skills/1', type: 'added', after: 'testing' },
    ]);
  });

  it('builds a dry-run rollback plan that restores the before snapshot through approval-cop', () => {
    const plan = buildRuntimeConfigRollbackPlan({
      beforePath: 'snapshots/run-123.before.json',
      afterPath: 'snapshots/run-123.after.json',
      targetPath: '.fbeast/.build/run-configs/run-123.json',
      before: { provider: 'claude', modules: { planner: true } },
      after: { provider: 'openai', modules: { planner: false, memory: true } },
      evidenceDir: 'rollback-evidence/runtime-run-123',
    });

    expect(plan.summary).toBe('Dry-run runtime config rollback plan for .fbeast/.build/run-configs/run-123.json');
    expect(plan.changedPaths).toEqual(['/modules/memory', '/modules/planner', '/provider']);
    expect(plan.readOnlyCapture[0]).toEqual(expect.arrayContaining([
      'node',
      '--input-type=module',
      'rollback-evidence/runtime-run-123',
    ]));
    expect(plan.readOnlyCapture[0].join(' ')).toContain('Refusing symlinked evidence path component');
    expect(plan.readOnlyCapture[1].join(' ')).toContain('copyFileNoFollow(process.argv[1], process.argv[2])');
    expect(plan.readOnlyCapture[1]).toEqual(expect.arrayContaining([
      'snapshots/run-123.before.json',
      'rollback-evidence/runtime-run-123/rollback-config.json',
    ]));
    expect(plan.readOnlyCapture[2].join(' ')).toContain('copyFileNoFollow(process.argv[1], process.argv[2])');
    expect(plan.readOnlyCapture[2]).toEqual(expect.arrayContaining([
      'snapshots/run-123.after.json',
      'rollback-evidence/runtime-run-123/after-config.json',
    ]));
    expect(plan.readOnlyCapture[3]).toEqual(expect.arrayContaining([
      'rollback-evidence/runtime-run-123/runtime-config-changes.json',
      'snapshots/run-123.before.json',
      'snapshots/run-123.after.json',
      '.fbeast/.build/run-configs/run-123.json',
      'rollback-evidence/runtime-run-123',
    ]));
    expect(plan.readOnlyCapture[3].join(' ')).not.toContain('"provider":"openai"');
    expect(plan.approvalGatedActions[0]).toEqual(expect.arrayContaining([
      'node',
      '--input-type=module',
      'rollback-evidence/runtime-run-123/rollback-config.json',
      '.fbeast/.build/run-configs/run-123.json',
      'rollback-evidence/runtime-run-123/after-config.json',
    ]));
    expect(plan.approvalGatedActions[0].slice(-2)).toEqual([
      expect.stringMatching(/^[a-f0-9]{64}$/u),
      expect.stringMatching(/^[a-f0-9]{64}$/u),
    ]);
    expect(plan.approvalGatedActions[0].join(' ')).toContain('lstat');
    expect(plan.approvalGatedActions[0].join(' ')).toContain('rollback snapshot no longer matches approved before snapshot');
    expect(plan.approvalGatedActions[0].join(' ')).toContain('target runtime config no longer matches after snapshot');
    expect(plan.postRollbackVerification.map(command => command.join(' '))).toContain(
      'cmp -s rollback-evidence/runtime-run-123/rollback-config.json .fbeast/.build/run-configs/run-123.json',
    );
    expect(plan.notes.join('\n')).toContain('dry-run only');
    expect(plan.notes.join('\n')).toContain('Snapshot parsing is bounded');
  });

  it('rejects snapshots with no runtime config change', () => {
    expect(() => buildRuntimeConfigRollbackPlan({
      beforePath: 'before.json',
      afterPath: 'after.json',
      targetPath: 'current.json',
      before: { provider: 'claude' },
      after: { provider: 'claude' },
    })).toThrow(/No runtime config changes/u);
  });

  it('rejects control characters in operator-rendered paths', () => {
    expect(() => buildRuntimeConfigRollbackPlan({
      beforePath: 'before.json',
      afterPath: 'after.json',
      targetPath: 'current\nforged.json',
      before: { provider: 'claude' },
      after: { provider: 'openai' },
    })).toThrow(/not safe for argv or Markdown/u);
  });

  it('uses a deterministic unique evidence directory when none is provided', () => {
    const first = defaultEvidenceDir('.fbeast/.build/run-configs/run-123.json');
    const second = defaultEvidenceDir('.fbeast/.build/run-configs/run-456.json');

    expect(first).toMatch(/^rollback-evidence\/runtime-config-run-123\.json-[a-f0-9]{12}$/u);
    expect(second).toMatch(/^rollback-evidence\/runtime-config-run-456\.json-[a-f0-9]{12}$/u);
    expect(first).not.toBe(second);
  });

  it('loads bounded JSON object snapshots and rejects arrays or oversized files', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'runtime-config-rollback-'));
    const good = join(workDir, 'before.json');
    const bad = join(workDir, 'bad.json');
    const oversized = join(workDir, 'oversized.json');
    const tooDeep = join(workDir, 'too-deep.json');
    await writeFile(good, JSON.stringify({ provider: 'claude' }));
    await writeFile(bad, JSON.stringify(['not', 'an', 'object']));
    await writeFile(oversized, `{"payload":"${'x'.repeat(1_048_577)}"}`);
    let nested: unknown = 'leaf';
    for (let index = 0; index < 65; index += 1) nested = { child: nested };
    await writeFile(tooDeep, JSON.stringify(nested));

    await expect(loadRuntimeConfigSnapshot(good)).resolves.toEqual({ provider: 'claude' });
    await expect(loadRuntimeConfigSnapshot(bad)).rejects.toThrow(/must contain a JSON object/u);
    await expect(loadRuntimeConfigSnapshot(oversized)).rejects.toThrow(/exceeds maxBytes/u);
    await expect(loadRuntimeConfigSnapshot(tooDeep)).rejects.toThrow(/exceeds maxDepth/u);
  });

  it('prints JSON and markdown dry-run plans without mutating the target config', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'runtime-config-rollback-cli-'));
    const before = join(workDir, 'before.json');
    const after = join(workDir, 'after.json');
    const target = join(workDir, 'current.json');
    await writeFile(before, `${JSON.stringify({ provider: 'claude' }, null, 2)}\n`);
    await writeFile(after, `${JSON.stringify({ provider: 'openai' }, null, 2)}\n`);
    await writeFile(target, `${JSON.stringify({ provider: 'openai' }, null, 2)}\n`);

    const jsonResult = spawnSync(process.execPath, [
      SCRIPT,
      '--dry-run',
      '--format', 'json',
      '--before', before,
      '--after', after,
      '--target', target,
      '--evidence-dir', join(workDir, 'evidence'),
    ], { cwd: ROOT, encoding: 'utf8' });

    expect(jsonResult.status).toBe(0);
    const parsed = JSON.parse(jsonResult.stdout);
    expect(parsed.changedPaths).toEqual(['/provider']);
    expect(parsed.readOnlyCapture[0]).toEqual(expect.arrayContaining(['node', '--input-type=module', join(workDir, 'evidence')]));
    expect(parsed.readOnlyCapture[0].join(' ')).toContain('Refusing symlinked evidence path component');
    expect(parsed.readOnlyCapture[1].join(' ')).toContain('copyFileNoFollow(process.argv[1], process.argv[2])');
    expect(parsed.readOnlyCapture[1]).toEqual(expect.arrayContaining([before, join(workDir, 'evidence', 'rollback-config.json')]));
    expect(parsed.readOnlyCapture[2].join(' ')).toContain('copyFileNoFollow(process.argv[1], process.argv[2])');
    expect(parsed.readOnlyCapture[2]).toEqual(expect.arrayContaining([after, join(workDir, 'evidence', 'after-config.json')]));
    expect(parsed.approvalGatedActions[0]).toEqual(expect.arrayContaining([
      'node',
      '--input-type=module',
      join(workDir, 'evidence', 'rollback-config.json'),
      target,
      join(workDir, 'evidence', 'after-config.json'),
    ]));
    expect(JSON.stringify(parsed.changes)).not.toContain('openai');
    await expect(readFile(target, 'utf8')).resolves.toContain('openai');

    const markdownResult = spawnSync(process.execPath, [
      SCRIPT,
      '--dry-run',
      '--before', before,
      '--after', after,
      '--target', target,
      '--evidence-dir', join(workDir, 'evidence'),
    ], { cwd: ROOT, encoding: 'utf8' });

    expect(markdownResult.status).toBe(0);
    expect(markdownResult.stdout).toContain('## 1. Capture read-only rollback evidence');
    expect(markdownResult.stdout).toContain('approval-cop run -- node');
    expect(markdownResult.stdout).toContain('Refusing symlinked evidence path component');
  });

  it('encodes markdown control characters in rendered changed paths', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'runtime-config-rollback-markdown-'));
    const before = join(workDir, 'before.json');
    const after = join(workDir, 'after.json');
    const target = join(workDir, 'current.json');
    await writeFile(before, JSON.stringify({ 'safe\n## fake`tick': 'old' }));
    await writeFile(after, JSON.stringify({ 'safe\n## fake`tick': 'new' }));
    await writeFile(target, JSON.stringify({ 'safe\n## fake`tick': 'new' }));

    const markdownResult = spawnSync(process.execPath, [
      SCRIPT,
      '--dry-run',
      '--before', before,
      '--after', after,
      '--target', target,
    ], { cwd: ROOT, encoding: 'utf8' });

    expect(markdownResult.status).toBe(0);
    expect(markdownResult.stdout).toContain('"/safe\\n## fake`tick": changed');
    expect(markdownResult.stdout).not.toContain('\n## fake`tick": changed');
  });
});
