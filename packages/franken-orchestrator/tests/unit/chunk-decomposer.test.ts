import { describe, it, expect, vi } from 'vitest';
import { ChunkDecomposer } from '../../src/planning/chunk-decomposer.js';
import type { ILlmClient } from '@franken/core';
import type { PlanContext } from '../../src/planning/plan-context-gatherer.js';

function mockLlm(response: string): ILlmClient {
  return { complete: vi.fn().mockResolvedValue(response) };
}

const emptyContext: PlanContext = {
  rampUp: '',
  relevantSignatures: [],
  packageDeps: {},
  existingPatterns: [],
};

const contextWithSignatures: PlanContext = {
  rampUp: '# Ramp Up\nThis is a monorepo.',
  relevantSignatures: [
    {
      path: 'src/deps.ts',
      signatures: 'export interface ILogger { info(msg: string): void; }',
    },
  ],
  packageDeps: { 'franken-orchestrator': ['vitest', 'typescript'] },
  existingPatterns: [],
};

const validChunks = [
  {
    id: 'define-types',
    objective: 'Define shared type interfaces',
    files: ['src/types.ts', 'tests/types.test.ts'],
    successCriteria: 'Type definitions compile',
    verificationCommand: 'npx tsc --noEmit',
    dependencies: [],
  },
  {
    id: 'implement-router',
    objective: 'Implement the HTTP router',
    files: ['src/router.ts', 'tests/router.test.ts'],
    successCriteria: 'Router tests pass',
    verificationCommand: 'npx vitest run tests/router.test.ts',
    dependencies: ['define-types'],
  },
];

const tenFieldChunks = [
  {
    id: 'define-types',
    objective: 'Define shared type interfaces',
    files: ['src/types.ts', 'tests/types.test.ts'],
    successCriteria: 'Type definitions compile',
    verificationCommand: 'npx tsc --noEmit',
    dependencies: [],
    context: 'Types are shared across modules',
    designDecisions: 'Use branded types for IDs',
    interfaceContract: 'export interface Widget { id: string; name: string; }',
    edgeCases: 'Empty name should be rejected',
    antiPatterns: 'Avoid using any type',
  },
  {
    id: 'implement-router',
    objective: 'Implement the HTTP router',
    files: ['src/router.ts', 'tests/router.test.ts'],
    successCriteria: 'Router tests pass',
    verificationCommand: 'npx vitest run tests/router.test.ts',
    dependencies: ['define-types'],
    context: 'Router handles all HTTP endpoints',
    designDecisions: 'Use Hono framework',
    interfaceContract: 'GET /widgets, POST /widgets',
    edgeCases: '404 for unknown routes',
    antiPatterns: 'Do not hardcode routes',
  },
];

const designDoc = `# Widget System Design

## Overview
Build a widget system with shared types and an HTTP router.

## Components
1. Type definitions in src/types.ts
2. HTTP router in src/router.ts
`;

describe('ChunkDecomposer', () => {
  describe('prompt construction', () => {
    it('sends design doc + codebase context to LLM', async () => {
      const llm = mockLlm(JSON.stringify(validChunks));
      const decomposer = new ChunkDecomposer(llm, { maxChunks: 12 });

      await decomposer.decompose(designDoc, contextWithSignatures);

      expect(llm.complete).toHaveBeenCalledOnce();
      const prompt = (llm.complete as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as string;

      // Should contain the design doc text
      expect(prompt).toContain('Widget System Design');
      // Should contain RAMP_UP content
      expect(prompt).toContain('# Ramp Up');
      expect(prompt).toContain('This is a monorepo.');
      // Should contain file signatures
      expect(prompt).toContain('src/deps.ts');
      expect(prompt).toContain('export interface ILogger');
    });

    it('includes codebase package deps in prompt', async () => {
      const llm = mockLlm(JSON.stringify(validChunks));
      const decomposer = new ChunkDecomposer(llm, { maxChunks: 12 });

      await decomposer.decompose(designDoc, contextWithSignatures);

      const prompt = (llm.complete as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as string;

      expect(prompt).toContain('vitest');
      expect(prompt).toContain('typescript');
    });
  });

  describe('response parsing', () => {
    it('parses valid 10-field chunk response', async () => {
      const llm = mockLlm(JSON.stringify(tenFieldChunks));
      const decomposer = new ChunkDecomposer(llm, { maxChunks: 12 });

      const chunks = await decomposer.decompose(designDoc, emptyContext);

      expect(chunks).toHaveLength(2);
      expect(chunks[0]!.id).toBe('define-types');
      expect(chunks[0]!.context).toBe('Types are shared across modules');
      expect(chunks[0]!.designDecisions).toBe('Use branded types for IDs');
      expect(chunks[0]!.interfaceContract).toBe(
        'export interface Widget { id: string; name: string; }',
      );
      expect(chunks[0]!.edgeCases).toBe('Empty name should be rejected');
      expect(chunks[0]!.antiPatterns).toBe('Avoid using any type');
      expect(chunks[1]!.id).toBe('implement-router');
      expect(chunks[1]!.dependencies).toEqual(['define-types']);
    });

    it('tolerates chunks missing optional new fields', async () => {
      const llm = mockLlm(JSON.stringify(validChunks));
      const decomposer = new ChunkDecomposer(llm, { maxChunks: 12 });

      const chunks = await decomposer.decompose(designDoc, emptyContext);

      expect(chunks).toHaveLength(2);
      expect(chunks[0]!.id).toBe('define-types');
      expect(chunks[0]!.objective).toBe('Define shared type interfaces');
      // Optional fields should be undefined
      expect(chunks[0]!.context).toBeUndefined();
      expect(chunks[0]!.designDecisions).toBeUndefined();
      expect(chunks[0]!.interfaceContract).toBeUndefined();
      expect(chunks[0]!.edgeCases).toBeUndefined();
      expect(chunks[0]!.antiPatterns).toBeUndefined();
    });

    it('handles JSON wrapped in markdown code fences', async () => {
      const wrapped =
        '```json\n' + JSON.stringify(validChunks) + '\n```';
      const llm = mockLlm(wrapped);
      const decomposer = new ChunkDecomposer(llm, { maxChunks: 12 });

      const chunks = await decomposer.decompose(designDoc, emptyContext);

      expect(chunks).toHaveLength(2);
      expect(chunks[0]!.id).toBe('define-types');
    });
  });

  describe('maxChunks enforcement', () => {
    it('respects maxChunks limit', async () => {
      const manyChunks = Array.from({ length: 15 }, (_, i) => ({
        id: `chunk-${String(i + 1).padStart(2, '0')}`,
        objective: `Task ${i + 1}`,
        files: [`src/file-${i + 1}.ts`],
        successCriteria: `Task ${i + 1} passes`,
        verificationCommand: `npx vitest run`,
        dependencies: [],
      }));

      const warnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});
      const llm = mockLlm(JSON.stringify(manyChunks));
      const decomposer = new ChunkDecomposer(llm, { maxChunks: 5 });

      const chunks = await decomposer.decompose(designDoc, emptyContext);

      expect(chunks).toHaveLength(5);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('validation', () => {
    it('throws on unparseable response', async () => {
      const llm = mockLlm('Not JSON at all, just random text.');
      const decomposer = new ChunkDecomposer(llm, { maxChunks: 12 });

      await expect(
        decomposer.decompose(designDoc, emptyContext),
      ).rejects.toThrow(/parse|JSON/i);
    });

    it('validates dependency references exist', async () => {
      const badDeps = [
        {
          id: 'chunk-a',
          objective: 'A',
          files: ['a.ts'],
          successCriteria: 'A passes',
          verificationCommand: 'npx vitest run',
          dependencies: ['nonexistent'],
        },
      ];

      const llm = mockLlm(JSON.stringify(badDeps));
      const decomposer = new ChunkDecomposer(llm, { maxChunks: 12 });

      await expect(
        decomposer.decompose(designDoc, emptyContext),
      ).rejects.toThrow(/nonexistent/);
    });

    it('detects cyclic dependencies', async () => {
      const cyclic = [
        {
          id: 'chunk-a',
          objective: 'A',
          files: ['a.ts'],
          successCriteria: 'A passes',
          verificationCommand: 'npx vitest run',
          dependencies: ['chunk-b'],
        },
        {
          id: 'chunk-b',
          objective: 'B',
          files: ['b.ts'],
          successCriteria: 'B passes',
          verificationCommand: 'npx vitest run',
          dependencies: ['chunk-a'],
        },
      ];

      const llm = mockLlm(JSON.stringify(cyclic));
      const decomposer = new ChunkDecomposer(llm, { maxChunks: 12 });

      await expect(
        decomposer.decompose(designDoc, emptyContext),
      ).rejects.toThrow(/cycl/i);
    });
  });
});
