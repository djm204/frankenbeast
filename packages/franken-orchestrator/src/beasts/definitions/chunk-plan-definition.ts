import { z } from 'zod';
import { isAbsolute, relative, resolve } from 'node:path';
import type { BeastDefinition } from '../types.js';
import { resolveCliEntrypoint } from './resolve-cli-entrypoint.js';

function resolveContainedConfigPath(fieldName: string, projectRoot: string | undefined, requested: string): string {
  if (!projectRoot) {
    return requested;
  }

  const root = resolve(projectRoot);
  const target = isAbsolute(requested) ? resolve(requested) : resolve(root, requested);
  const rel = relative(root, target);
  if (rel === '..' || rel.startsWith('../') || isAbsolute(rel)) {
    throw new Error(`${fieldName} resolves outside project root: ${requested}`);
  }

  return target;
}

export const chunkPlanDefinition: BeastDefinition = {
  id: 'chunk-plan',
  version: 1,
  label: 'Design Doc -> Chunk Creation',
  description: 'Turn a design document into chunked implementation artifacts through the tracked init workflow.',
  executionModeDefault: 'process',
  configSchema: z.object({
    designDocPath: z.string().min(1),
    outputDir: z.string().min(1),
    projectRoot: z.string().optional(),
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
  buildProcessSpec: (config) => {
    const projectRoot = String(config.projectRoot ?? process.env.FBEAST_ROOT ?? process.cwd());
    const designDocPath = resolveContainedConfigPath(
      'designDocPath',
      projectRoot,
      String(config.designDocPath),
    );

    return {
      command: process.execPath,
      args: [
        resolveCliEntrypoint(),
        'plan',
        '--design-doc', designDocPath,
        '--output-dir', String(config.outputDir),
      ],
      env: { FRANKENBEAST_SPAWNED: '1' },
      cwd: projectRoot,
    };
  },
  telemetryLabels: {
    family: 'chunk-plan',
  },
};
