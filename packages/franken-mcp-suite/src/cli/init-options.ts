import { createInterface } from 'node:readline/promises';
import type { FbeastServer } from '../shared/config.js';

const ALL_SERVERS: FbeastServer[] = [
  'memory', 'planner', 'critique', 'firewall', 'observer', 'governor', 'skills',
];

export interface ResolvedInitOptions {
  hooks: boolean;
  servers?: FbeastServer[];
}

type PromptForServers = () => Promise<FbeastServer[]>;

export async function resolveInitOptions(
  argv: string[],
  promptForServers: PromptForServers = promptForServerSelection,
): Promise<ResolvedInitOptions> {
  const hooks = argv.includes('--hooks');
  const pickArg = argv.find((arg) => arg === '--pick' || arg.startsWith('--pick='));

  if (!pickArg) {
    return { hooks };
  }

  if (pickArg === '--pick') {
    return {
      hooks,
      servers: await promptForServers(),
    };
  }

  return {
    hooks,
    servers: parseServerSelection(pickArg.slice('--pick='.length)),
  };
}

export function parseServerSelection(value: string): FbeastServer[] {
  const raw = value.trim();
  if (!raw || raw === 'all') {
    return [...ALL_SERVERS];
  }

  const requested = new Set(
    raw.split(',')
      .map((entry) => entry.trim())
      .filter((entry): entry is FbeastServer => entry.length > 0),
  );
  const invalid = [...requested].filter((entry) => !ALL_SERVERS.includes(entry));

  if (invalid.length > 0) {
    throw new Error(`Unknown fbeast servers: ${invalid.join(', ')}`);
  }

  return ALL_SERVERS.filter((server) => requested.has(server));
}

async function promptForServerSelection(): Promise<FbeastServer[]> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    console.log(`Available servers: ${ALL_SERVERS.join(', ')}`);
    const answer = await rl.question('Select servers to install (comma-separated or "all") [all]: ');
    return parseServerSelection(answer);
  } finally {
    rl.close();
  }
}
