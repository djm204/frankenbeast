import { BeastContext } from './franken-context.js';
import type { BeastInput } from '../types.js';
import { deterministicUuid } from '@franken/types';

/** Creates a new BeastContext from user input. */
export function createContext(input: BeastInput): BeastContext {
  const sessionId = input.sessionId ?? deterministicUuid('packages/franken-orchestrator/src/context/context-factory.ts');
  return new BeastContext(input.projectId, sessionId, input.userInput);
}
