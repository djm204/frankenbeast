import { describe, it, expect, vi } from 'vitest';
import { createCritiqueAdapter } from '../adapters/critique-adapter.js';
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

  it('rejects unknown critique evaluators instead of falling back to defaults', async () => {
    const server = createCritiqueServer({ critique: createCritiqueAdapter() });

    const result = await server.callTool('fbeast_critique_evaluate', {
      content: 'x',
      evaluators: 'logicloop',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('Unknown critique evaluator: logicloop');
    expect(result.content[0]!.text).toContain('logic-loop, complexity, conciseness');
  });

  it('rejects partially unknown critique evaluator lists deterministically', async () => {
    const server = createCritiqueServer({ critique: createCritiqueAdapter() });

    const result = await server.callTool('fbeast_critique_evaluate', {
      content: 'x',
      evaluators: 'logic-loop,missing-one,complexity,stale-two',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('Unknown critique evaluators: missing-one, stale-two');
  });

  it('serves critique tools when lazy audit DB setup fails', async () => {
    const critique = {
      evaluate: vi.fn().mockResolvedValue({ verdict: 'pass', score: 1, findings: [] }),
      compare: vi.fn(),
    };
    const server = createCritiqueServer({
      critique,
      getObserver: () => { throw new Error('audit db unavailable'); },
    });

    const result = await server.callTool('fbeast_critique_evaluate', { content: 'ok' });

    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain('pass');
  });
});
