import { z } from 'zod';
import type { BeastDefinition } from '../types.js';
import { resolveCliEntrypoint } from './resolve-cli-entrypoint.js';

export const designInterviewDefinition: BeastDefinition = {
  id: 'design-interview',
  version: 1,
  label: 'Design Interview',
  description: 'Create a tracked agent that drives an interactive design interview and writes a design document artifact.',
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
  buildProcessSpec: (config) => ({
    command: process.execPath,
    args: [
      resolveCliEntrypoint(),
      'interview',
      '--goal', String(config.goal),
      '--output', String(config.outputPath),
    ],
    env: { FRANKENBEAST_SPAWNED: '1' },
    cwd: String(config.projectRoot ?? process.cwd()),
  }),
  telemetryLabels: {
    family: 'design-interview',
  },
};
