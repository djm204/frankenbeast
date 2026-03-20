# Chunk 6.1: ReflectionEvaluator

**Phase:** 6 — Absorb Reflection into Critique
**Depends on:** Phase 1 (heartbeat deleted)
**Estimated size:** Small (~80 lines + tests)

---

## Purpose

Create `ReflectionEvaluator` as a standard `ICritiqueEvaluator` in `franken-critique`. This evaluator uses an LLM to assess whether the current execution approach is sound.

## Implementation

```typescript
// packages/franken-critique/src/evaluators/reflection-evaluator.ts

import type { ICritiqueEvaluator, CritiqueContext, CritiqueResult } from '@frankenbeast/types';

export interface ReflectionEvaluatorOptions {
  /** LLM client for generating reflections */
  llmClient: { complete(prompt: string): Promise<string> };
  /** Maximum reflection length (tokens) */
  maxTokens?: number;
}

export class ReflectionEvaluator implements ICritiqueEvaluator {
  readonly name = 'reflection';
  readonly description = 'LLM-based self-assessment of execution approach';

  constructor(private options: ReflectionEvaluatorOptions) {}

  async evaluate(context: CritiqueContext): Promise<CritiqueResult> {
    const prompt = this.buildReflectionPrompt(context);
    const reflection = await this.options.llmClient.complete(prompt);

    // Parse the reflection into a structured result
    const severity = this.assessSeverity(reflection);

    return {
      evaluator: this.name,
      severity,
      message: reflection,
      suggestion: severity > 5
        ? 'Consider revising the current approach based on reflection feedback'
        : undefined,
    };
  }

  private buildReflectionPrompt(context: CritiqueContext): string {
    return [
      'You are reviewing the progress of an AI agent execution.',
      '',
      `Current phase: ${context.phase ?? 'unknown'}`,
      `Steps completed: ${context.stepsCompleted ?? 0}`,
      '',
      'Work done so far:',
      context.workSummary ?? 'No summary available',
      '',
      'Original objective:',
      context.objective ?? 'No objective specified',
      '',
      'Evaluate:',
      '1. Is the current approach aligned with the objective?',
      '2. Are there any obvious issues or risks?',
      '3. Should the agent continue, adjust, or stop?',
      '',
      'Rate severity 1-10 (1=on track, 10=completely wrong approach).',
      'Format: SEVERITY: <number>\\n<your assessment>',
    ].join('\n');
  }

  private assessSeverity(reflection: string): number {
    // Parse "SEVERITY: N" from the reflection
    const match = reflection.match(/SEVERITY:\s*(\d+)/i);
    if (match) {
      return Math.min(10, Math.max(1, parseInt(match[1], 10)));
    }
    // Default to medium if unparseable
    return 5;
  }
}
```

## Integration with Critique Chain

The `ReflectionEvaluator` is added to a critique chain like any other evaluator:

```typescript
// In orchestrator config or Beast Loop setup
const critiqueChain = new CritiqueChain([
  new LintEvaluator(),
  new TestPassEvaluator(),
  new ReflectionEvaluator({ llmClient }),  // optional — enabled via config
]);
```

Enable via run config:
```yaml
critique:
  evaluators:
    - lint
    - test-pass
    - reflection    # enables LLM-based reflection
```

## Tests

```typescript
// packages/franken-critique/tests/unit/evaluators/reflection-evaluator.test.ts

describe('ReflectionEvaluator', () => {
  const mockLlm = {
    complete: vi.fn(),
  };

  describe('evaluate()', () => {
    it('calls LLM with reflection prompt', async () => {
      mockLlm.complete.mockResolvedValue('SEVERITY: 3\nApproach is sound, minor optimization possible');
      const evaluator = new ReflectionEvaluator({ llmClient: mockLlm });
      const result = await evaluator.evaluate({
        phase: 'execution',
        stepsCompleted: 5,
        workSummary: 'Refactored auth module, 3 tests passing',
        objective: 'Fix login bug',
      });

      expect(result.severity).toBe(3);
      expect(result.message).toContain('sound');
      expect(result.suggestion).toBeUndefined(); // severity <= 5
    });

    it('returns suggestion when severity > 5', async () => {
      mockLlm.complete.mockResolvedValue('SEVERITY: 8\nCompletely wrong approach');
      const evaluator = new ReflectionEvaluator({ llmClient: mockLlm });
      const result = await evaluator.evaluate({ objective: 'Build feature X' });

      expect(result.severity).toBe(8);
      expect(result.suggestion).toBeDefined();
    });

    it('defaults to severity 5 when unparseable', async () => {
      mockLlm.complete.mockResolvedValue('I think things are going okay');
      const evaluator = new ReflectionEvaluator({ llmClient: mockLlm });
      const result = await evaluator.evaluate({});

      expect(result.severity).toBe(5);
    });

    it('clamps severity to 1-10 range', async () => {
      mockLlm.complete.mockResolvedValue('SEVERITY: 15\nVery wrong');
      const evaluator = new ReflectionEvaluator({ llmClient: mockLlm });
      const result = await evaluator.evaluate({});

      expect(result.severity).toBe(10);
    });

    it('includes phase and objective in prompt', async () => {
      mockLlm.complete.mockResolvedValue('SEVERITY: 2\nGood');
      const evaluator = new ReflectionEvaluator({ llmClient: mockLlm });
      await evaluator.evaluate({
        phase: 'planning',
        objective: 'Deploy to prod',
      });

      const prompt = mockLlm.complete.mock.calls[0][0];
      expect(prompt).toContain('planning');
      expect(prompt).toContain('Deploy to prod');
    });
  });
});
```

## Files

- **Add:** `packages/franken-critique/src/evaluators/reflection-evaluator.ts`
- **Add:** `packages/franken-critique/tests/unit/evaluators/reflection-evaluator.test.ts`
- **Modify:** `packages/franken-critique/src/index.ts` — export `ReflectionEvaluator`

## Exit Criteria

- `ReflectionEvaluator` implements `ICritiqueEvaluator`
- Uses LLM to generate severity-scored reflection
- Can be added to any critique chain via config
- Tests cover: prompt construction, severity parsing, clamping, default values
- Exported from `franken-critique`
