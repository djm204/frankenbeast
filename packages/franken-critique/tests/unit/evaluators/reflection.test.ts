import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReflectionEvaluator } from '../../../src/evaluators/reflection-evaluator.js';

describe('ReflectionEvaluator', () => {
  const mockLlm = {
    complete: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('properties', () => {
    it('has name "reflection" and category "heuristic"', () => {
      const evaluator = new ReflectionEvaluator({ llmClient: mockLlm });
      expect(evaluator.name).toBe('reflection');
      expect(evaluator.category).toBe('heuristic');
    });
  });

  describe('evaluate()', () => {
    it('calls LLM with reflection prompt containing phase and objective', async () => {
      mockLlm.complete.mockResolvedValue('SEVERITY: 3\nApproach is sound, minor optimization possible');
      const evaluator = new ReflectionEvaluator({ llmClient: mockLlm });

      await evaluator.evaluate({
        content: 'Refactored auth module',
        metadata: {
          phase: 'execution',
          stepsCompleted: 5,
          objective: 'Fix login bug',
        },
      });

      const prompt = mockLlm.complete.mock.calls[0]![0];
      expect(prompt).toContain('execution');
      expect(prompt).toContain('Fix login bug');
      expect(prompt).toContain('Refactored auth module');
    });

    it('returns pass verdict and parsed severity for low-severity reflection', async () => {
      mockLlm.complete.mockResolvedValue('SEVERITY: 3\nApproach is sound');
      const evaluator = new ReflectionEvaluator({ llmClient: mockLlm });

      const result = await evaluator.evaluate({
        content: 'Work in progress',
        metadata: { phase: 'execution' },
      });

      expect(result.evaluatorName).toBe('reflection');
      expect(result.verdict).toBe('pass');
      expect(result.score).toBeGreaterThan(0.5);
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]!.message).toContain('sound');
    });

    it('returns fail verdict when severity > 5', async () => {
      mockLlm.complete.mockResolvedValue('SEVERITY: 8\nCompletely wrong approach');
      const evaluator = new ReflectionEvaluator({ llmClient: mockLlm });

      const result = await evaluator.evaluate({
        content: 'Bad work',
        metadata: { objective: 'Build feature X' },
      });

      expect(result.verdict).toBe('fail');
      expect(result.score).toBeLessThan(0.5);
      expect(result.findings[0]!.suggestion).toBeDefined();
    });

    it('defaults to severity 5 when unparseable', async () => {
      mockLlm.complete.mockResolvedValue('I think things are going okay');
      const evaluator = new ReflectionEvaluator({ llmClient: mockLlm });

      const result = await evaluator.evaluate({
        content: '',
        metadata: {},
      });

      // severity 5 → score = 1 - (5-1)/9 ≈ 0.556
      expect(result.score).toBeCloseTo(0.556, 1);
    });

    it('clamps severity to 1-10 range', async () => {
      mockLlm.complete.mockResolvedValue('SEVERITY: 15\nVery wrong');
      const evaluator = new ReflectionEvaluator({ llmClient: mockLlm });

      const result = await evaluator.evaluate({
        content: '',
        metadata: {},
      });

      // severity 10 → score 0.0
      expect(result.score).toBe(0);
    });

    it('clamps severity minimum to 1', async () => {
      mockLlm.complete.mockResolvedValue('SEVERITY: 0\nPerfect');
      const evaluator = new ReflectionEvaluator({ llmClient: mockLlm });

      const result = await evaluator.evaluate({
        content: '',
        metadata: {},
      });

      // severity 1 → score ~0.9
      expect(result.score).toBeGreaterThan(0.8);
    });

    it('handles missing metadata gracefully', async () => {
      mockLlm.complete.mockResolvedValue('SEVERITY: 4\nAcceptable progress');
      const evaluator = new ReflectionEvaluator({ llmClient: mockLlm });

      const result = await evaluator.evaluate({
        content: 'Some code',
        metadata: {},
      });

      expect(result.verdict).toBe('pass');
    });
  });
});
