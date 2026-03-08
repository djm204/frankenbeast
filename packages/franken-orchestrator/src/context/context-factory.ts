import { randomUUID } from 'node:crypto';
import { BeastContext } from './franken-context.js';
import type { BeastInput } from '../types.js';

/** Creates a new BeastContext from user input. */
export function createContext(input: BeastInput): BeastContext {
  const sessionId = input.sessionId ?? randomUUID();
  return new BeastContext(input.projectId, sessionId, input.userInput);
}
