import { z } from 'zod';
import type { BeastDefinition } from '../types.js';

export const designInterviewDefinition: BeastDefinition = {
  id: 'design-interview',
  version: 1,
  label: 'Design Interview',
  description: 'Interview for a design goal and produce a design document artifact.',
  executionModeDefault: 'process',
  configSchema: z.object({
    goal: z.string().min(1),
    outputPath: z.string().min(1),
  }).strict(),
  interviewPrompts: [
    {
      key: 'goal',
      prompt: 'What should the design interview produce?',
      kind: 'string',
      required: true,
    },
    {
      key: 'outputPath',
      prompt: 'Where should the design document be written?',
      kind: 'string',
      required: true,
    },
  ],
  buildProcessSpec: () => ({
    command: 'node',
    args: ['-e', 'setTimeout(() => process.exit(0), 50)'],
  }),
  telemetryLabels: {
    family: 'design-interview',
  },
};
