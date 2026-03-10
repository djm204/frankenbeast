import { describe, it, expect, vi } from 'vitest';
import { ChunkRemediator } from '../../src/planning/chunk-remediator.js';
import type { ILlmClient } from '@franken/core';
import type { ChunkDefinition } from '../../src/cli/file-writer.js';
import type { PlanContext } from '../../src/planning/plan-context-gatherer.js';
import type { ValidationIssue } from '../../src/planning/chunk-validator.js';

function mockLlm(response: string): ILlmClient {
  return { complete: vi.fn().mockResolvedValue(response) };
}

const sampleChunks: ChunkDefinition[] = [
  {
    id: 'define-types',
    objective: 'Define shared type interfaces',
    files: ['src/types.ts', 'tests/types.test.ts'],
    successCriteria: 'Type definitions compile',
    verificationCommand: 'npx tsc --noEmit',
    dependencies: [],
    context: 'Types are shared across modules',
    interfaceContract: 'export interface Widget { id: string; }',
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
  },
];

const sampleIssues: ValidationIssue[] = [
  {
    severity: 'error',
    chunkId: 'implement-router',
    category: 'wrong_dependency',
    description: 'Chunk depends on define-types but does not use any types from it',
    suggestion: 'Remove define-types from dependencies',
  },
  {
    severity: 'warning',
    chunkId: 'define-types',
    category: 'chunk_too_thin',
    description: 'Missing edgeCases field',
    suggestion: 'Add edge case documentation',
  },
];

const context: PlanContext = {
  rampUp: '# Ramp Up\nThis is a monorepo with 10 packages.',
  relevantSignatures: [
    {
      path: 'src/deps.ts',
      signatures: 'export interface ILogger { info(msg: string): void; }',
    },
  ],
  packageDeps: { 'franken-orchestrator': ['vitest', 'typescript'] },
  existingPatterns: [
    { description: 'Adapter pattern', example: 'class FooAdapter extends BaseAdapter {}' },
  ],
};

describe('ChunkRemediator', () => {
  it('sends original chunks + issues to LLM for patching', async () => {
    const patchedChunks: ChunkDefinition[] = [
      {
        ...sampleChunks[0]!,
        edgeCases: 'Empty interface definition',
      },
      {
        ...sampleChunks[1]!,
        dependencies: [], // fixed: removed wrong dependency
      },
    ];
    const llmResponse = JSON.stringify(patchedChunks);
    const llm = mockLlm(llmResponse);
    const remediator = new ChunkRemediator(llm);

    const result = await remediator.remediate(sampleChunks, sampleIssues, context);

    // Verify prompt contains issue category and chunk ID
    expect(llm.complete).toHaveBeenCalledOnce();
    const prompt = (llm.complete as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as string;
    expect(prompt).toContain('wrong_dependency');
    expect(prompt).toContain('chunk_too_thin');
    expect(prompt).toContain('implement-router');
    expect(prompt).toContain('define-types');

    // Verify patched chunks are returned with fixes applied
    expect(result).toHaveLength(2);
    expect(result[0]!.edgeCases).toBe('Empty interface definition');
    expect(result[1]!.dependencies).toEqual([]);
  });

  it('preserves chunk count — does not add or remove chunks', async () => {
    const patchedChunks: ChunkDefinition[] = [
      { ...sampleChunks[0]!, edgeCases: 'Added edge cases' },
      { ...sampleChunks[1]!, dependencies: [] },
    ];
    const llmResponse = JSON.stringify(patchedChunks);
    const llm = mockLlm(llmResponse);
    const remediator = new ChunkRemediator(llm);

    const result = await remediator.remediate(sampleChunks, sampleIssues, context);

    // 2 input chunks -> 2 output chunks
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe('define-types');
    expect(result[1]!.id).toBe('implement-router');
  });

  it('falls back to original chunks on parse failure', async () => {
    const llm = mockLlm('Not JSON at all, just random text with no brackets.');
    const remediator = new ChunkRemediator(llm);

    const result = await remediator.remediate(sampleChunks, sampleIssues, context);

    // Should return originals — no throw
    expect(result).toHaveLength(2);
    expect(result).toEqual(sampleChunks);
  });
});
