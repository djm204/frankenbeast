import { z } from 'zod';
import type { BeastDefinition } from '../types.js';

export const martinLoopDefinition: BeastDefinition = {
  id: 'martin-loop',
  version: 1,
  label: 'Martin Loop',
  description: 'Create a tracked agent for MartinLoop, validate the chunk directory, then dispatch execution.',
  executionModeDefault: 'process',
  configSchema: z.object({
    provider: z.string().min(1),
    objective: z.string().min(1),
    chunkDirectory: z.string().min(1),
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
    {
      key: 'chunkDirectory',
      prompt: 'Which chunk directory should MartinLoop execute from?',
      kind: 'directory',
      required: true,
    },
  ],
  buildProcessSpec: (config) => ({
    command: 'node',
    args: ['-e', `console.log("martin-loop:${String(config.objective ?? '')}")`],
    env: {
      FRANKENBEAST_PROVIDER: String(config.provider ?? ''),
      FRANKENBEAST_CHUNK_DIRECTORY: String(config.chunkDirectory ?? ''),
    },
  }),
  telemetryLabels: {
    family: 'martin-loop',
  },
};
