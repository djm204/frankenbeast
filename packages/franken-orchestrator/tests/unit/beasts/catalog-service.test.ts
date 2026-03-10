import { describe, expect, it } from 'vitest';
import { BeastCatalogService } from '../../../src/beasts/services/beast-catalog-service.js';

describe('BeastCatalogService', () => {
  it('lists the fixed v1 beast definitions in stable order', () => {
    const service = new BeastCatalogService();

    expect(service.listDefinitions().map((definition) => definition.id)).toEqual([
      'design-interview',
      'chunk-plan',
      'martin-loop',
    ]);
  });

  it('returns definition metadata with config schema and interview prompts', () => {
    const service = new BeastCatalogService();
    const definition = service.getDefinition('martin-loop');

    expect(definition).toBeDefined();
    expect(definition?.label).toBe('Martin Loop');
    expect(definition?.executionModeDefault).toBe('process');
    expect(definition?.configSchema.safeParse({
      provider: 'claude',
      objective: 'Implement the run detail page',
    }).success).toBe(true);
    expect(definition?.interviewPrompts.map((prompt) => prompt.key)).toEqual([
      'provider',
      'objective',
    ]);
  });

  it('returns undefined for an unknown definition id', () => {
    const service = new BeastCatalogService();
    expect(service.getDefinition('beast-does-not-exist')).toBeUndefined();
  });
});
