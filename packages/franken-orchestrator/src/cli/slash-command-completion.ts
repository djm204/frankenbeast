import type { CompleterResult } from 'node:readline';

export const CHAT_SLASH_COMMANDS = [
  { name: '/plan', description: 'Create a plan for a task' },
  { name: '/run', description: 'Run a task' },
  { name: '/status', description: 'Show the current session status' },
  { name: '/diff', description: 'Show changes from the current session' },
  { name: '/approve', description: 'Approve the pending action' },
  { name: '/reject', description: 'Reject the pending action' },
  { name: '/session', description: 'Show the current session' },
  { name: '/quit', description: 'Exit chat' },
] as const;

export const CHAT_SLASH_COMMAND_NAMES = CHAT_SLASH_COMMANDS.map(({ name }) => name);

function isSubsequence(candidate: string, query: string): boolean {
  let queryIndex = 0;
  for (const character of candidate) {
    if (character === query[queryIndex]) queryIndex++;
  }
  return queryIndex === query.length;
}

/** Complete only the command token; arguments remain ordinary chat input. */
export function completeSlashCommand(line: string): CompleterResult {
  if (!line.startsWith('/') || /\s/.test(line)) return [[], line];

  const query = line.toLowerCase();
  const prefixMatches = CHAT_SLASH_COMMAND_NAMES.filter((command) => command.startsWith(query));
  const matches = prefixMatches.length > 0
    ? prefixMatches
    : CHAT_SLASH_COMMAND_NAMES.filter((command) => isSubsequence(command, query));

  return [matches, line];
}