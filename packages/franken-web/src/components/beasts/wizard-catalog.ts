import type { BeastCatalogEntry, BeastInterviewPrompt } from '../../lib/beast-api';

export const FALLBACK_BEAST_CATALOG: readonly BeastCatalogEntry[] = [
  {
    id: 'design-interview',
    version: 1,
    label: 'Design Interview',
    description: 'Create a tracked agent that drives an interactive design interview and writes a design document artifact.',
    executionModeDefault: 'process',
    interviewPrompts: [
      { key: 'goal', prompt: 'What should the design interview produce?', kind: 'string', required: true },
      { key: 'outputPath', prompt: 'Where should the design document be written?', kind: 'string', required: true },
    ],
  },
  {
    id: 'chunk-plan',
    version: 1,
    label: 'Design Doc -> Chunk Creation',
    description: 'Turn a design document into chunked implementation artifacts through the tracked init workflow.',
    executionModeDefault: 'process',
    interviewPrompts: [
      { key: 'designDocPath', prompt: 'Which design document should be chunked?', kind: 'file', required: true },
      { key: 'outputDir', prompt: 'Where should the chunk plan be written?', kind: 'string', required: true },
    ],
  },
  {
    id: 'martin-loop',
    version: 1,
    label: 'Martin Loop',
    description: 'Create a tracked agent for MartinLoop, validate the chunk directory, then dispatch execution.',
    executionModeDefault: 'process',
    interviewPrompts: [
      { key: 'provider', prompt: 'Which provider should run the martin loop?', kind: 'string', required: true, options: ['claude', 'codex', 'gemini', 'aider'] },
      { key: 'objective', prompt: 'What should the martin loop accomplish?', kind: 'string', required: true },
      { key: 'chunkDirectory', prompt: 'Which chunk directory should MartinLoop execute from?', kind: 'directory', required: true },
    ],
  },
] as const;

export function getEffectiveCatalog(catalog: readonly BeastCatalogEntry[] | undefined): readonly BeastCatalogEntry[] {
  return catalog && catalog.length > 0 ? catalog : FALLBACK_BEAST_CATALOG;
}

export function findCatalogEntry(
  catalog: readonly BeastCatalogEntry[] | undefined,
  id: string | undefined,
): BeastCatalogEntry | undefined {
  if (!id) return undefined;
  return getEffectiveCatalog(catalog).find((entry) => entry.id === id);
}

export function getPromptLabel(prompt: BeastInterviewPrompt): string {
  return prompt.prompt.replace(/[?.!]+$/g, '');
}

export function getPromptValue(
  values: Record<string, unknown> | undefined,
  prompt: BeastInterviewPrompt,
): unknown {
  if (!values) return undefined;
  if (prompt.key === 'goal') {
    return values.goal ?? values.topic;
  }
  if (prompt.key === 'designDocPath') {
    return values.designDocPath ?? values.docPath;
  }
  if (prompt.key === 'chunkDirectory') {
    return values.chunkDirectory ?? values.chunkDir;
  }
  return values[prompt.key];
}

export function isBlankCatalogValue(value: unknown): boolean {
  if (typeof value === 'boolean') return false;
  return typeof value !== 'string' || value.trim().length === 0;
}
