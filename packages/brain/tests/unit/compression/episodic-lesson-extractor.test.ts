import { describe, it, expect, vi } from 'vitest';
import { EpisodicLessonExtractor } from '../../../src/compression/episodic-lesson-extractor.js';
import type { ILlmClient } from '../../../src/compression/llm-client-interface.js';
import type { EpisodicTrace } from '../../../src/types/index.js';
import { generateId } from '../../../src/types/index.js';

function makeTrace(overrides: Partial<EpisodicTrace> = {}): EpisodicTrace {
  return {
    id: generateId(),
    type: 'episodic',
    projectId: 'proj-a',
    status: 'failure',
    createdAt: Date.now(),
    taskId: 'task-1',
    input: { cmd: 'npm build' },
    output: { exitCode: 1, stderr: 'Cannot find module' },
    ...overrides,
  };
}

function makeLlm(response = 'Lesson: avoid missing modules.'): ILlmClient {
  return { complete: vi.fn(async () => response) };
}

describe('EpisodicLessonExtractor', () => {
  it('calls ILlmClient.complete() with the failure traces formatted in the prompt', async () => {
    const llm = makeLlm();
    const extractor = new EpisodicLessonExtractor(llm);
    const traces = [makeTrace(), makeTrace()];

    await extractor.extract(traces);

    expect(llm.complete).toHaveBeenCalledOnce();
    const prompt = vi.mocked(llm.complete).mock.calls[0]![0];
    expect(prompt).toContain('Cannot find module');
  });

  it('returns a SemanticChunk with type="semantic"', async () => {
    const extractor = new EpisodicLessonExtractor(makeLlm());
    const result = await extractor.extract([makeTrace()]);
    expect(result.type).toBe('semantic');
  });

  it('returned chunk source is "lesson-learned"', async () => {
    const extractor = new EpisodicLessonExtractor(makeLlm());
    const result = await extractor.extract([makeTrace()]);
    expect(result.source).toBe('lesson-learned');
  });

  it('returned chunk content is the LLM response', async () => {
    const extractor = new EpisodicLessonExtractor(makeLlm('Use --legacy-peer-deps.'));
    const result = await extractor.extract([makeTrace()]);
    expect(result.content).toBe('Use --legacy-peer-deps.');
  });

  it('returned chunk projectId matches the traces projectId', async () => {
    const extractor = new EpisodicLessonExtractor(makeLlm());
    const result = await extractor.extract([makeTrace({ projectId: 'my-project' })]);
    expect(result.projectId).toBe('my-project');
  });

  it('returned chunk status is "success"', async () => {
    const extractor = new EpisodicLessonExtractor(makeLlm());
    const result = await extractor.extract([makeTrace()]);
    expect(result.status).toBe('success');
  });

  it('throws when given an empty traces array', async () => {
    const extractor = new EpisodicLessonExtractor(makeLlm());
    await expect(extractor.extract([])).rejects.toThrow();
  });

  it('has a new ULID id', async () => {
    const traces = [makeTrace()];
    const extractor = new EpisodicLessonExtractor(makeLlm());
    const result = await extractor.extract(traces);
    expect(traces.map((t) => t.id)).not.toContain(result.id);
  });
});
