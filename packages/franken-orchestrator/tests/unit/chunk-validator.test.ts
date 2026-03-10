import { describe, it, expect, vi } from 'vitest';
import { ChunkValidator } from '../../src/planning/chunk-validator.js';
import type { ILlmClient } from '@franken/core';
import type { ChunkDefinition } from '../../src/cli/file-writer.js';
import type { PlanContext } from '../../src/planning/plan-context-gatherer.js';

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

const designDoc = `# Widget System Design

## Overview
Build a widget system with shared types and an HTTP router.

## Components
1. Type definitions in src/types.ts
2. HTTP router in src/router.ts
`;

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

describe('ChunkValidator', () => {
  it('returns valid: true with no issues for good chunks', async () => {
    const llmResponse = JSON.stringify({
      valid: true,
      issues: [],
    });
    const llm = mockLlm(llmResponse);
    const validator = new ChunkValidator(llm);

    const result = await validator.validate(sampleChunks, designDoc, context);

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('returns issues with correct structure', async () => {
    const llmResponse = JSON.stringify({
      valid: false,
      issues: [
        {
          severity: 'error',
          chunkId: 'implement-router',
          category: 'wrong_dependency',
          description: 'Chunk depends on define-types but does not use any types from it',
          suggestion: 'Remove define-types from dependencies',
        },
        {
          severity: 'warning',
          chunkId: null,
          category: 'design_gap',
          description: 'Design doc mentions validation but no chunk addresses it',
          suggestion: 'Add a validation chunk',
        },
      ],
    });
    const llm = mockLlm(llmResponse);
    const validator = new ChunkValidator(llm);

    const result = await validator.validate(sampleChunks, designDoc, context);

    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(2);

    expect(result.issues[0]!.severity).toBe('error');
    expect(result.issues[0]!.chunkId).toBe('implement-router');
    expect(result.issues[0]!.category).toBe('wrong_dependency');
    expect(result.issues[0]!.description).toContain('define-types');
    expect(result.issues[0]!.suggestion).toBeTruthy();

    expect(result.issues[1]!.severity).toBe('warning');
    expect(result.issues[1]!.chunkId).toBeNull();
    expect(result.issues[1]!.category).toBe('design_gap');
  });

  it('includes chunk array + design doc + context in LLM prompt', async () => {
    const llmResponse = JSON.stringify({ valid: true, issues: [] });
    const llm = mockLlm(llmResponse);
    const validator = new ChunkValidator(llm);

    await validator.validate(sampleChunks, designDoc, context);

    expect(llm.complete).toHaveBeenCalledOnce();
    const prompt = (llm.complete as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as string;

    // Should contain chunk IDs
    expect(prompt).toContain('define-types');
    expect(prompt).toContain('implement-router');
    // Should contain design doc text
    expect(prompt).toContain('Widget System Design');
    // Should contain RAMP_UP content
    expect(prompt).toContain('# Ramp Up');
    expect(prompt).toContain('This is a monorepo with 10 packages.');
    // Should contain file signatures
    expect(prompt).toContain('src/deps.ts');
    expect(prompt).toContain('export interface ILogger');
    // Should contain package deps
    expect(prompt).toContain('vitest');
    expect(prompt).toContain('typescript');
  });

  it('handles unparseable LLM response gracefully as invalid', async () => {
    const llm = mockLlm('Not valid JSON at all, just random text.');
    const validator = new ChunkValidator(llm);

    const result = await validator.validate(sampleChunks, designDoc, context);

    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.severity).toBe('error');
    expect(result.issues[0]!.chunkId).toBeNull();
    expect(result.issues[0]!.category).toBe('design_gap');
    expect(result.issues[0]!.description).toContain('could not be parsed');
    expect(result.issues[0]!.suggestion).toContain('Review chunks manually');
  });

  it('passes through revisedChunks when validator provides them', async () => {
    const revisedChunks: ChunkDefinition[] = [
      {
        id: 'define-types',
        objective: 'Define shared type interfaces (revised)',
        files: ['src/types.ts', 'tests/types.test.ts'],
        successCriteria: 'Type definitions compile',
        verificationCommand: 'npx tsc --noEmit',
        dependencies: [],
      },
      {
        id: 'implement-router',
        objective: 'Implement the HTTP router (revised)',
        files: ['src/router.ts', 'tests/router.test.ts'],
        successCriteria: 'Router tests pass',
        verificationCommand: 'npx vitest run tests/router.test.ts',
        dependencies: [],  // dependency removed — parallelizable
      },
    ];
    const llmResponse = JSON.stringify({
      valid: false,
      issues: [
        {
          severity: 'warning',
          chunkId: 'implement-router',
          category: 'parallelizable',
          description: 'implement-router does not actually need define-types output',
          suggestion: 'Remove dependency to allow parallel execution',
        },
      ],
      revisedChunks,
    });
    const llm = mockLlm(llmResponse);
    const validator = new ChunkValidator(llm);

    const result = await validator.validate(sampleChunks, designDoc, context);

    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.revisedChunks).toBeDefined();
    expect(result.revisedChunks).toHaveLength(2);
    expect(result.revisedChunks![1]!.dependencies).toEqual([]);
    expect(result.revisedChunks![1]!.objective).toContain('revised');
  });
});
