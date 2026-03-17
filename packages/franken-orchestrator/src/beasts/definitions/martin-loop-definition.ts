import { z } from 'zod';
import type { BeastDefinition } from '../types.js';
import { resolveCliEntrypoint } from './resolve-cli-entrypoint.js';

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
    projectRoot: z.string().optional(),
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
    command: process.execPath,
    args: [
      resolveCliEntrypoint(),
      'run',
      '--provider', String(config.provider),
      '--chunks', String(config.chunkDirectory),
    ],
    env: { FRANKENBEAST_SPAWNED: '1' },
    cwd: String(config.projectRoot ?? process.cwd()),
  }),
  telemetryLabels: {
    family: 'martin-loop',
  },
};
