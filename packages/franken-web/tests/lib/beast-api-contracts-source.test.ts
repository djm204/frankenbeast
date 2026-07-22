import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/lib/beast-api.ts'), 'utf8');
const sharedAgentTypes = [
  'TrackedAgentSummary',
  'TrackedAgentEvent',
  'TrackedAgentDetail',
  'AgentLlmConfig',
  'AgentGitConfig',
] as const;

describe('Beast API agent model contracts', () => {
  it('forwards agent DTOs from the shared @franken/types contract', () => {
    const sharedReExport = source.match(/export type \{(?<types>[\s\S]*?)\} from '@franken\/types';/);

    expect(sharedReExport).toBeTruthy();
    for (const typeName of sharedAgentTypes) {
      expect(sharedReExport?.groups?.types, typeName).toMatch(new RegExp(`\\b${typeName}\\b`));
      expect(source, typeName).not.toMatch(new RegExp(`(?:interface|type)\\s+${typeName}\\b`));
    }
  });
});
