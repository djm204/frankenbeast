import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SQLiteBeastRepository } from '../../../src/beasts/repository/sqlite-beast-repository.js';
import { BeastCatalogService } from '../../../src/beasts/services/beast-catalog-service.js';
import { BeastInterviewService } from '../../../src/beasts/services/beast-interview-service.js';

describe('BeastInterviewService', () => {
  let workDir: string | undefined;

  afterEach(async () => {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  it('starts an interview session from a beast definition', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beast-interview-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const service = new BeastInterviewService(repo, new BeastCatalogService());

    const session = service.start('martin-loop');

    expect(session.definitionId).toBe('martin-loop');
    expect(session.status).toBe('active');
    expect(session.answers).toEqual({});
    expect(session.currentPrompt).toMatchObject({
      key: 'provider',
      prompt: 'Which provider should run the martin loop?',
    });
  });

  it('persists answers and advances to the next prompt', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beast-interview-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const service = new BeastInterviewService(repo, new BeastCatalogService());
    const started = service.start('chunk-plan');

    const progressed = service.answer(started.id, 'docs/plans/design.md');

    expect(progressed.complete).toBe(false);
    expect(progressed.session.answers).toEqual({
      designDocPath: 'docs/plans/design.md',
    });
    expect(progressed.session.currentPrompt).toMatchObject({
      key: 'outputDir',
    });
  });

  it('completes and validates the config when the final answer is submitted', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beast-interview-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const service = new BeastInterviewService(repo, new BeastCatalogService());
    const started = service.start('design-interview');

    const second = service.answer(started.id, 'Plan the beasts section');
    const completed = service.answer(second.session.id, 'docs/plans/beasts.md');

    expect(completed.complete).toBe(true);
    expect(completed.session.status).toBe('completed');
    expect(completed.config).toEqual({
      goal: 'Plan the beasts section',
      outputPath: 'docs/plans/beasts.md',
    });
  });

  it('resumes an in-progress interview from persisted answers', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-beast-interview-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const service = new BeastInterviewService(repo, new BeastCatalogService());
    const started = service.start('martin-loop');

    service.answer(started.id, 'claude');

    const resumed = service.resume(started.id);

    expect(resumed.complete).toBe(false);
    expect(resumed.session.answers).toEqual({ provider: 'claude' });
    expect(resumed.currentPrompt).toMatchObject({
      key: 'objective',
      prompt: 'What should the martin loop accomplish?',
    });
  });
});
