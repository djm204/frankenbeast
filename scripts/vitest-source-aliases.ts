import { resolve } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const FRANKEN_SOURCE_ENTRYPOINTS = {
  '@franken/brain': 'packages/franken-brain/src/index.ts',
  '@franken/planner': 'packages/franken-planner/src/index.ts',
  '@franken/observer': 'packages/franken-observer/src/index.ts',
  '@franken/critique': 'packages/franken-critique/src/index.ts',
  '@franken/governor': 'packages/franken-governor/src/index.ts',
  '@franken/types/path-containment': 'packages/franken-types/src/path-containment.ts',
  '@franken/types/utils': 'packages/franken-types/src/utils/index.ts',
  '@franken/types': 'packages/franken-types/src/index.ts',
  '@franken/orchestrator': 'packages/franken-orchestrator/src/index.ts',
} as const;

export type FrankenSourceAlias = keyof typeof FRANKEN_SOURCE_ENTRYPOINTS;

export const createFrankenSourceAliases = (configUrl: string | URL) => {
  const packageRoot = dirname(fileURLToPath(configUrl));
  const workspaceRoot = resolve(packageRoot, '../..');

  return Object.fromEntries(
    Object.entries(FRANKEN_SOURCE_ENTRYPOINTS).map(([alias, sourcePath]) => [
      alias,
      resolve(workspaceRoot, sourcePath),
    ]),
  ) as Record<FrankenSourceAlias, string>;
};
