import type {
  Evaluator,
  EvaluationInput,
  EvaluationResult,
  EvaluationFinding,
} from './evaluator.js';

export interface ReflectionEvaluatorOptions {
  llmClient: { complete(prompt: string): Promise<string> };
  maxTokens?: number;
}

/**
 * LLM-based self-assessment evaluator.
 * Asks an LLM to evaluate whether the current execution approach is sound.
 * Produces a severity-scored reflection that feeds into the critique chain.
 */
export class ReflectionEvaluator implements Evaluator {
  readonly name = 'reflection';
  readonly category = 'heuristic' as const;

  constructor(private readonly options: ReflectionEvaluatorOptions) {}

  async evaluate(input: EvaluationInput): Promise<EvaluationResult> {
    const prompt = this.buildReflectionPrompt(input);
    const reflection = await this.options.llmClient.complete(prompt);

    const severity = this.parseSeverity(reflection);
    const score = Math.max(0, 1 - (severity - 1) / 9); // 1→1.0, 10→0.0

    const finding: EvaluationFinding = {
      message: reflection,
      severity: severity > 5 ? 'critical' : severity > 3 ? 'warning' : 'info',
      suggestion:
        severity > 5
          ? 'Consider revising the current approach based on reflection feedback'
          : undefined,
    };

    return {
      evaluatorName: this.name,
      verdict: severity > 5 ? 'fail' : 'pass',
      score,
      findings: [finding],
    };
  }

  private buildReflectionPrompt(input: EvaluationInput): string {
    const phase = (input.metadata['phase'] as string) ?? 'unknown';
    const stepsCompleted = (input.metadata['stepsCompleted'] as number) ?? 0;
    const objective = (input.metadata['objective'] as string) ?? 'No objective specified';

    return [
      'You are reviewing the progress of an AI agent execution.',
      '',
      `Current phase: ${phase}`,
      `Steps completed: ${stepsCompleted}`,
      '',
      'Work done so far:',
      input.content || 'No summary available',
      '',
      'Original objective:',
      objective,
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

  private parseSeverity(reflection: string): number {
    const match = reflection.match(/SEVERITY:\s*(\d+)/i);
    if (match) {
      return Math.min(10, Math.max(1, parseInt(match[1]!, 10)));
    }
    return 5; // default to medium if unparseable
  }
}
