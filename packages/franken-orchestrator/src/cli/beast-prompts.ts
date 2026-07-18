import type { InterviewIO } from '../planning/interview-loop.js';
import type { BeastDefinition } from '../beasts/types.js';
import { coerceInterviewAnswer } from '../beasts/interview-answers.js';

export async function collectBeastConfig(
  io: InterviewIO,
  definition: BeastDefinition,
): Promise<Readonly<Record<string, unknown>>> {
  const answers: Record<string, unknown> = {};

  for (const prompt of definition.interviewPrompts) {
    const answer = await io.ask(prompt.prompt);
    answers[prompt.key] = coerceInterviewAnswer(prompt, answer);
  }

  return definition.configSchema.parse(answers);
}
