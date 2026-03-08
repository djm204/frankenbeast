import { describe, it, expect, vi } from 'vitest';
import { LlmGraphBuilder } from '../../src/planning/llm-graph-builder.js';
import type { PlanTask } from '../../src/deps.js';
import type { ILlmClient } from '@franken/types';

function taskById(tasks: readonly PlanTask[], id: string): PlanTask | undefined {
  return tasks.find((t) => t.id === id);
}

/** Builds a mock ILlmClient that returns the given string. */
function mockLlm(response: string): ILlmClient {
  return { complete: vi.fn().mockResolvedValue(response) };
}

/** A valid chunk array response from the LLM. */
function validChunksJson(chunks: unknown[]): string {
  return JSON.stringify(chunks);
}

const twoChunks = [
  {
    id: '01_setup',
    objective: 'Set up project scaffolding',
    files: ['src/index.ts', 'package.json'],
    successCriteria: 'Project compiles',
    verificationCommand: 'npx tsc --noEmit',
    dependencies: [],
  },
  {
    id: '02_feature',
    objective: 'Implement the feature',
    files: ['src/feature.ts'],
    successCriteria: 'Tests pass',
    verificationCommand: 'npx vitest run',
    dependencies: ['01_setup'],
  },
];

const intent = { goal: 'Build a new widget system with React components' };

describe('LlmGraphBuilder', () => {
  describe('implements GraphBuilder interface', () => {
    it('has a build method that accepts an intent and returns a PlanGraph', async () => {
      const llm = mockLlm(validChunksJson(twoChunks));
      const builder = new LlmGraphBuilder(llm);
      const graph = await builder.build(intent);

      expect(graph).toBeDefined();
      expect(graph.tasks).toBeDefined();
      expect(Array.isArray(graph.tasks)).toBe(true);
    });
  });

  describe('LLM interaction', () => {
    it('sends a decomposition prompt to ILlmClient.complete()', async () => {
      const llm = mockLlm(validChunksJson(twoChunks));
      const builder = new LlmGraphBuilder(llm);
      await builder.build(intent);

      expect(llm.complete).toHaveBeenCalledOnce();
      const prompt = (llm.complete as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(prompt).toContain(intent.goal);
    });

    it('includes TDD and atomic commit instructions in the prompt', async () => {
      const llm = mockLlm(validChunksJson(twoChunks));
      const builder = new LlmGraphBuilder(llm);
      await builder.build(intent);

      const prompt = (llm.complete as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(prompt).toMatch(/TDD/i);
      expect(prompt).toMatch(/atomic/i);
    });

    it('includes JSON output format specification in the prompt', async () => {
      const llm = mockLlm(validChunksJson(twoChunks));
      const builder = new LlmGraphBuilder(llm);
      await builder.build(intent);

      const prompt = (llm.complete as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(prompt).toMatch(/JSON/i);
      expect(prompt).toContain('id');
      expect(prompt).toContain('objective');
      expect(prompt).toContain('dependencies');
    });
  });

  describe('JSON parsing', () => {
    it('parses a valid JSON array into chunk definitions', async () => {
      const llm = mockLlm(validChunksJson(twoChunks));
      const builder = new LlmGraphBuilder(llm);
      const graph = await builder.build(intent);

      // 2 chunks × 2 tasks each = 4 tasks
      expect(graph.tasks).toHaveLength(4);
    });

    it('handles JSON wrapped in markdown code fences', async () => {
      const wrapped = '```json\n' + validChunksJson(twoChunks) + '\n```';
      const llm = mockLlm(wrapped);
      const builder = new LlmGraphBuilder(llm);
      const graph = await builder.build(intent);

      expect(graph.tasks).toHaveLength(4);
    });

    it('handles JSON wrapped in plain code fences (no language tag)', async () => {
      const wrapped = '```\n' + validChunksJson(twoChunks) + '\n```';
      const llm = mockLlm(wrapped);
      const builder = new LlmGraphBuilder(llm);
      const graph = await builder.build(intent);

      expect(graph.tasks).toHaveLength(4);
    });

    it('handles JSON with surrounding whitespace', async () => {
      const padded = '\n\n  ' + validChunksJson(twoChunks) + '  \n\n';
      const llm = mockLlm(padded);
      const builder = new LlmGraphBuilder(llm);
      const graph = await builder.build(intent);

      expect(graph.tasks).toHaveLength(4);
    });

    it('handles JSON with trailing commas', async () => {
      const withTrailing = `[
        {
          "id": "01_setup",
          "objective": "Setup",
          "files": ["src/index.ts",],
          "successCriteria": "Compiles",
          "verificationCommand": "npx tsc",
          "dependencies": [],
        },
      ]`;
      const llm = mockLlm(withTrailing);
      const builder = new LlmGraphBuilder(llm);
      const graph = await builder.build(intent);

      expect(graph.tasks).toHaveLength(2);
    });
  });

  describe('task pair creation', () => {
    it('creates impl+harden task pair per chunk', async () => {
      const llm = mockLlm(validChunksJson(twoChunks));
      const builder = new LlmGraphBuilder(llm);
      const graph = await builder.build(intent);

      expect(taskById(graph.tasks, 'impl:01_setup')).toBeDefined();
      expect(taskById(graph.tasks, 'harden:01_setup')).toBeDefined();
      expect(taskById(graph.tasks, 'impl:02_feature')).toBeDefined();
      expect(taskById(graph.tasks, 'harden:02_feature')).toBeDefined();
    });

    it('impl task objective contains chunk objective and content', async () => {
      const llm = mockLlm(validChunksJson(twoChunks));
      const builder = new LlmGraphBuilder(llm);
      const graph = await builder.build(intent);

      const implTask = taskById(graph.tasks, 'impl:01_setup');
      expect(implTask!.objective).toContain('Set up project scaffolding');
      expect(implTask!.objective).toContain('IMPL_01_setup_DONE');
    });

    it('harden task objective contains chunk id and harden prompt', async () => {
      const llm = mockLlm(validChunksJson(twoChunks));
      const builder = new LlmGraphBuilder(llm);
      const graph = await builder.build(intent);

      const hardenTask = taskById(graph.tasks, 'harden:01_setup');
      expect(hardenTask!.objective).toContain('hardening');
      expect(hardenTask!.objective).toContain('HARDEN_01_setup_DONE');
    });

    it('sets requiredSkills with cli:<chunkId>', async () => {
      const llm = mockLlm(validChunksJson(twoChunks));
      const builder = new LlmGraphBuilder(llm);
      const graph = await builder.build(intent);

      expect(taskById(graph.tasks, 'impl:01_setup')!.requiredSkills).toContain('cli:01_setup');
      expect(taskById(graph.tasks, 'harden:01_setup')!.requiredSkills).toContain('cli:01_setup');
    });
  });

  describe('dependency wiring', () => {
    it('first impl task has no dependencies when chunk has none', async () => {
      const llm = mockLlm(validChunksJson(twoChunks));
      const builder = new LlmGraphBuilder(llm);
      const graph = await builder.build(intent);

      const impl01 = taskById(graph.tasks, 'impl:01_setup');
      expect(impl01!.dependsOn).toEqual([]);
    });

    it('harden:N depends on impl:N', async () => {
      const llm = mockLlm(validChunksJson(twoChunks));
      const builder = new LlmGraphBuilder(llm);
      const graph = await builder.build(intent);

      const harden01 = taskById(graph.tasks, 'harden:01_setup');
      expect(harden01!.dependsOn).toEqual(['impl:01_setup']);
    });

    it('impl:N depends on harden tasks of its declared dependencies', async () => {
      const llm = mockLlm(validChunksJson(twoChunks));
      const builder = new LlmGraphBuilder(llm);
      const graph = await builder.build(intent);

      const impl02 = taskById(graph.tasks, 'impl:02_feature');
      // 02_feature depends on 01_setup → impl:02_feature depends on harden:01_setup
      expect(impl02!.dependsOn).toContain('harden:01_setup');
    });

    it('handles diamond dependencies correctly', async () => {
      const diamond = [
        { id: '01_base', objective: 'Base', files: [], successCriteria: '', verificationCommand: '', dependencies: [] },
        { id: '02_left', objective: 'Left', files: [], successCriteria: '', verificationCommand: '', dependencies: ['01_base'] },
        { id: '03_right', objective: 'Right', files: [], successCriteria: '', verificationCommand: '', dependencies: ['01_base'] },
        { id: '04_merge', objective: 'Merge', files: [], successCriteria: '', verificationCommand: '', dependencies: ['02_left', '03_right'] },
      ];

      const llm = mockLlm(validChunksJson(diamond));
      const builder = new LlmGraphBuilder(llm);
      const graph = await builder.build(intent);

      expect(graph.tasks).toHaveLength(8); // 4 chunks × 2 tasks
      const implMerge = taskById(graph.tasks, 'impl:04_merge');
      expect(implMerge!.dependsOn).toContain('harden:02_left');
      expect(implMerge!.dependsOn).toContain('harden:03_right');
    });
  });

  describe('chunk ID sanitization', () => {
    it('sanitizes chunk IDs for use as git branch names', async () => {
      const chunks = [
        { id: 'chunk with spaces!@#', objective: 'Test', files: [], successCriteria: '', verificationCommand: '', dependencies: [] },
      ];
      const llm = mockLlm(validChunksJson(chunks));
      const builder = new LlmGraphBuilder(llm);
      const graph = await builder.build(intent);

      const ids = graph.tasks.map((t) => t.id);
      // Should be sanitized: only alphanumeric, underscores, hyphens
      for (const id of ids) {
        const chunkPart = id.replace(/^(impl|harden):/, '');
        expect(chunkPart).toMatch(/^[a-zA-Z0-9_-]+$/);
      }
    });
  });

  describe('maxChunks enforcement', () => {
    it('defaults maxChunks to 12', async () => {
      const manyChunks = Array.from({ length: 15 }, (_, i) => ({
        id: `chunk_${String(i + 1).padStart(2, '0')}`,
        objective: `Task ${i + 1}`,
        files: [],
        successCriteria: '',
        verificationCommand: '',
        dependencies: [],
      }));

      const llm = mockLlm(validChunksJson(manyChunks));
      const builder = new LlmGraphBuilder(llm);
      const graph = await builder.build(intent);

      // 12 chunks × 2 = 24 tasks (truncated from 15)
      expect(graph.tasks).toHaveLength(24);
    });

    it('emits a warning when truncating', async () => {
      const manyChunks = Array.from({ length: 15 }, (_, i) => ({
        id: `chunk_${String(i + 1).padStart(2, '0')}`,
        objective: `Task ${i + 1}`,
        files: [],
        successCriteria: '',
        verificationCommand: '',
        dependencies: [],
      }));

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const llm = mockLlm(validChunksJson(manyChunks));
      const builder = new LlmGraphBuilder(llm);
      await builder.build(intent);

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Truncating'));
      warnSpy.mockRestore();
    });

    it('respects custom maxChunks option', async () => {
      const manyChunks = Array.from({ length: 10 }, (_, i) => ({
        id: `chunk_${String(i + 1).padStart(2, '0')}`,
        objective: `Task ${i + 1}`,
        files: [],
        successCriteria: '',
        verificationCommand: '',
        dependencies: [],
      }));

      const llm = mockLlm(validChunksJson(manyChunks));
      const builder = new LlmGraphBuilder(llm, { maxChunks: 5 });
      const graph = await builder.build(intent);

      // 5 chunks × 2 = 10 tasks
      expect(graph.tasks).toHaveLength(10);
    });
  });

  describe('validation', () => {
    it('throws on cyclic dependencies', async () => {
      const cyclic = [
        { id: '01_a', objective: 'A', files: [], successCriteria: '', verificationCommand: '', dependencies: ['02_b'] },
        { id: '02_b', objective: 'B', files: [], successCriteria: '', verificationCommand: '', dependencies: ['01_a'] },
      ];

      const llm = mockLlm(validChunksJson(cyclic));
      const builder = new LlmGraphBuilder(llm);

      await expect(builder.build(intent)).rejects.toThrow(/cycl/i);
    });

    it('throws when dependency references non-existent chunk', async () => {
      const badRef = [
        { id: '01_a', objective: 'A', files: [], successCriteria: '', verificationCommand: '', dependencies: ['99_missing'] },
      ];

      const llm = mockLlm(validChunksJson(badRef));
      const builder = new LlmGraphBuilder(llm);

      await expect(builder.build(intent)).rejects.toThrow(/99_missing/);
    });

    it('throws descriptive error on completely unparseable LLM response', async () => {
      const llm = mockLlm('This is not JSON at all, just random text from the LLM.');
      const builder = new LlmGraphBuilder(llm);

      await expect(builder.build(intent)).rejects.toThrow(/parse|JSON/i);
    });

    it('throws on non-array JSON response', async () => {
      const llm = mockLlm('{"not": "an array"}');
      const builder = new LlmGraphBuilder(llm);

      await expect(builder.build(intent)).rejects.toThrow(/array/i);
    });

    it('throws on chunks missing required fields', async () => {
      const incomplete = [
        { id: '01_a', objective: 'A' }, // missing files, successCriteria, etc
      ];

      const llm = mockLlm(JSON.stringify(incomplete));
      const builder = new LlmGraphBuilder(llm);

      await expect(builder.build(intent)).rejects.toThrow(/missing|required|invalid/i);
    });
  });

  describe('empty input', () => {
    it('returns empty PlanGraph when LLM returns empty array', async () => {
      const llm = mockLlm('[]');
      const builder = new LlmGraphBuilder(llm);
      const graph = await builder.build(intent);

      expect(graph.tasks).toEqual([]);
    });
  });
});
