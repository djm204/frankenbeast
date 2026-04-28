import { createInterface } from 'node:readline/promises';
import type { FbeastServer } from '../shared/config.js';

const ALL_SERVERS: FbeastServer[] = [
  'memory', 'planner', 'critique', 'firewall', 'observer', 'governor', 'skills',
];

export interface ResolvedInitOptions {
  hooks: boolean;
  servers?: FbeastServer[];
  mode: 'standard' | 'proxy';
}

type PromptForServers = () => Promise<FbeastServer[]>;

export async function resolveInitOptions(
  argv: string[],
  promptForServers: PromptForServers = promptForServerSelection,
): Promise<ResolvedInitOptions> {
  const hooks = argv.includes('--hooks');
  const pickArg = argv.find((arg) => arg === '--pick' || arg.startsWith('--pick='));
  const modeArg = argv.find((a) => a.startsWith('--mode='));
  const mode = modeArg ? parseModeArg(modeArg.slice('--mode='.length)) : 'standard';

  if (!pickArg) {
    return { hooks, mode };
  }

  if (pickArg === '--pick') {
    return {
      hooks,
      mode,
      servers: await promptForServers(),
    };
  }

  return {
    hooks,
    mode,
    servers: parseServerSelection(pickArg.slice('--pick='.length)),
  };
}

function parseModeArg(value: string): 'standard' | 'proxy' {
  if (value === 'standard' || value === 'proxy') return value;
  throw new Error(`Unknown --mode value: ${value}. Expected 'standard' or 'proxy'.`);
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
