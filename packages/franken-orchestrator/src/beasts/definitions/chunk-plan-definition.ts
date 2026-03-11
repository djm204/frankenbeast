import { z } from 'zod';
import type { BeastDefinition } from '../types.js';

export const chunkPlanDefinition: BeastDefinition = {
  id: 'chunk-plan',
  version: 1,
  label: 'Design Doc -> Chunk Creation',
  description: 'Turn a design document into chunked implementation artifacts through the tracked init workflow.',
  executionModeDefault: 'process',
  configSchema: z.object({
    designDocPath: z.string().min(1),
    outputDir: z.string().min(1),
  }).strict(),
  interviewPrompts: [
    {
      key: 'designDocPath',
      prompt: 'Which design document should be chunked?',
      kind: 'file',
      required: true,
    },
    {
      key: 'outputDir',
      prompt: 'Where should the chunk plan be written?',
      kind: 'string',
      required: true,
    },
  ],
  buildProcessSpec: () => ({
    command: 'node',
    args: ['-e', 'setTimeout(() => process.exit(0), 50)'],
  }),
  telemetryLabels: {
    family: 'chunk-plan',
  },
};
