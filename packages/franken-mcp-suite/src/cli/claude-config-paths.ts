import { join } from 'node:path';

export interface ClaudeConfigDirInput {
  cwd: string;
  homeDir: string;
  exists: (path: string) => boolean;
}

export function resolveClaudeConfigDir(input: ClaudeConfigDirInput): string {
  const projectDir = join(input.cwd, '.claude');
  if (input.exists(projectDir)) {
    return projectDir;
  }

  return join(input.homeDir, '.claude');
}
