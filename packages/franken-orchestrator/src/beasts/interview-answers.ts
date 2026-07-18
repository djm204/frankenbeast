import type { BeastInterviewPrompt } from './types.js';

export class InvalidBeastInterviewAnswerError extends Error {
  constructor(
    public readonly prompt: BeastInterviewPrompt,
    public readonly answer: string,
  ) {
    const allowed = prompt.options?.join(', ') ?? 'none';
    super(`Invalid answer for '${prompt.key}': expected one of ${allowed}`);
    this.name = 'InvalidBeastInterviewAnswerError';
  }
}

export function coerceInterviewAnswer(prompt: BeastInterviewPrompt, answer: string): unknown {
  const normalizedOptionAnswer = answer.trim();
  if (prompt.options && !prompt.options.includes(normalizedOptionAnswer)) {
    throw new InvalidBeastInterviewAnswerError(prompt, answer);
  }

  if (prompt.kind === 'boolean') {
    const normalized = normalizedOptionAnswer.toLowerCase();
    return normalized === 'true' || normalized === 'yes' || normalized === 'y';
  }

  return prompt.options ? normalizedOptionAnswer : answer;
}
