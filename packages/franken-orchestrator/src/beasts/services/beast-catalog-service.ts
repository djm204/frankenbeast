import type { BeastDefinition } from '../types.js';
import { BEAST_DEFINITIONS } from '../definitions/catalog.js';

export class BeastCatalogService {
  listDefinitions(): readonly BeastDefinition[] {
    return BEAST_DEFINITIONS;
  }

  getDefinition(definitionId: string): BeastDefinition | undefined {
    return BEAST_DEFINITIONS.find((definition) => definition.id === definitionId);
  }
}
