import { z } from 'zod';
import type { BeastDefinition } from '../types.js';

export const martinLoopDefinition: BeastDefinition = {
  id: 'martin-loop',
  version: 1,
  label: 'Martin Loop',
  description: 'Run the martin loop against a concrete engineering objective.',
  executionModeDefault: 'process',
  configSchema: z.object({
    provider: z.string().min(1),
    objective: z.string().min(1),
  }).strict(),
  interviewPrompts: [
    {
      key: 'provider',
      prompt: 'Which provider should run the martin loop?',
      kind: 'string',
      required: true,
      options: ['claude', 'codex', 'gemini', 'aider'],
    },
    {
      key: 'objective',
      prompt: 'What should the martin loop accomplish?',
      kind: 'string',
      required: true,
    },
  ],
  telemetryLabels: {
    family: 'martin-loop',
  },
};
