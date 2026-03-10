import { describe, it, expect } from 'vitest';
import { GhostDependencyEvaluator } from '../../../../src/critique/evaluators/ghost-dependency.js';
import type { EvaluationInput } from '../../../../src/critique/types/evaluation.js';

function createInput(content: string): EvaluationInput {
  return { content, metadata: {} };
}

describe('GhostDependencyEvaluator', () => {
  const knownPackages = ['express', 'zod', 'vitest', '@franken/brain'];

  it('implements Evaluator interface', () => {
    const evaluator = new GhostDependencyEvaluator(knownPackages);
    expect(evaluator.name).toBe('ghost-dependency');
    expect(evaluator.category).toBe('deterministic');
    expect(typeof evaluator.evaluate).toBe('function');
  });

  it('passes when all imports are known', async () => {
    const evaluator = new GhostDependencyEvaluator(knownPackages);
    const content = `import express from 'express';\nimport { z } from 'zod';`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('pass');
    expect(result.score).toBe(1);
    expect(result.findings).toHaveLength(0);
  });

  it('fails when an unknown package is imported', async () => {
    const evaluator = new GhostDependencyEvaluator(knownPackages);
    const content = `import ghost from 'ghost-package';`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.message).toContain('ghost-package');
  });

  it('ignores relative imports', async () => {
    const evaluator = new GhostDependencyEvaluator(knownPackages);
    const content = `import { foo } from './local.js';\nimport bar from '../utils/bar.js';`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('pass');
    expect(result.findings).toHaveLength(0);
  });

  it('ignores node: built-in imports', async () => {
    const evaluator = new GhostDependencyEvaluator(knownPackages);
    const content = `import { readFile } from 'node:fs/promises';`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('pass');
    expect(result.findings).toHaveLength(0);
  });

  it('detects require() calls with unknown packages', async () => {
    const evaluator = new GhostDependencyEvaluator(knownPackages);
    const content = `const x = require('unknown-lib');`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.message).toContain('unknown-lib');
  });

  it('handles scoped packages correctly', async () => {
    const evaluator = new GhostDependencyEvaluator(knownPackages);
    const content = `import brain from '@franken/brain';`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('pass');
    expect(result.findings).toHaveLength(0);
  });

  it('detects multiple ghost dependencies', async () => {
    const evaluator = new GhostDependencyEvaluator(knownPackages);
    const content = `import a from 'ghost-a';\nimport b from 'ghost-b';`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings).toHaveLength(2);
  });

  it('passes with no imports', async () => {
    const evaluator = new GhostDependencyEvaluator(knownPackages);
    const result = await evaluator.evaluate(createInput('const x = 1;'));

    expect(result.verdict).toBe('pass');
    expect(result.score).toBe(1);
  });
});
