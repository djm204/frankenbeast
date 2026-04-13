import { describe, it, expect, vi } from 'vitest';
import { createCritiqueServer } from './critique.js';

describe('Critique Server', () => {
  it('exposes 2 tools', () => {
    const server = createCritiqueServer({
      critique: {
        evaluate: vi.fn(),
        compare: vi.fn(),
      },
    });

    const names = server.tools.map((t) => t.name);
    expect(names).toEqual(['fbeast_critique_evaluate', 'fbeast_critique_compare']);
  });

  it('delegates evaluate to the critique adapter with evaluator selection', async () => {
    const critique = {
      evaluate: vi.fn().mockResolvedValue({
        verdict: 'warn',
        score: 0.72,
        findings: [{ severity: 'warning', message: 'deep nesting' }],
      }),
      compare: vi.fn().mockResolvedValue({
        originalScore: 0.5,
        revisedScore: 0.8,
        delta: 0.3,
        direction: 'improved',
        originalFindings: [],
        revisedFindings: [],
      }),
    };

    const server = createCritiqueServer({ critique });
    const evaluateTool = server.tools.find((t) => t.name === 'fbeast_critique_evaluate')!;
    const compareTool = server.tools.find((t) => t.name === 'fbeast_critique_compare')!;

    const evaluateResult = await evaluateTool.handler({
      content: 'x',
      criteria: 'correctness',
      evaluators: 'logic-loop,complexity',
    });
    expect(critique.evaluate).toHaveBeenCalledWith({
      content: 'x',
      criteria: ['correctness'],
      evaluators: ['logic-loop', 'complexity'],
    });
    expect(evaluateResult.content[0]!.text).toContain('0.72');

    const compareResult = await compareTool.handler({ original: 'var x = 1', revised: 'const x = 1' });
    expect(critique.compare).toHaveBeenCalledWith({ original: 'var x = 1', revised: 'const x = 1' });
    expect(compareResult.content[0]!.text).toContain('improved');
  });
});
