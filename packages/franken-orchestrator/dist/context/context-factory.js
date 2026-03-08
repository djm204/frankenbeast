import { randomUUID } from 'node:crypto';
import { BeastContext } from './franken-context.js';
/** Creates a new BeastContext from user input. */
export function createContext(input) {
    const sessionId = input.sessionId ?? randomUUID();
    return new BeastContext(input.projectId, sessionId, input.userInput);
}
//# sourceMappingURL=context-factory.js.map