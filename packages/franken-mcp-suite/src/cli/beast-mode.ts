import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { FbeastConfig } from '../shared/config.js';

export const SUPPORTED_BEAST_PROVIDERS = ['anthropic-api', 'codex-cli', 'claude-cli'] as const;
export type BeastProvider = (typeof SUPPORTED_BEAST_PROVIDERS)[number];
export const DEFAULT_BEAST_PROVIDER: BeastProvider = 'anthropic-api';

export function formatSupportedBeastProviders(): string {
  return SUPPORTED_BEAST_PROVIDERS.join(', ');
}

function parseBeastProvider(value: string): BeastProvider {
  if ((SUPPORTED_BEAST_PROVIDERS as readonly string[]).includes(value)) {
    return value as BeastProvider;
  }

  throw new Error(
    `Invalid beast provider "${value}". Valid providers: ${formatSupportedBeastProviders()}`,
  );
}

export interface BeastModeDeps {
  root: string;
  confirm(message: string): Promise<boolean>;
  exec(command: string, args: string[]): Promise<void>;
}

export async function runBeastMode(argv: string[], deps: BeastModeDeps): Promise<void> {
  const provider = parseBeastProvider(
    argv.find((arg) => arg.startsWith('--provider='))?.split('=')[1] ?? DEFAULT_BEAST_PROVIDER,
  );

  const config = existsSync(join(deps.root, '.fbeast', 'config.json'))
    ? FbeastConfig.load(deps.root)
    : FbeastConfig.init(deps.root);

  if (provider === 'claude-cli' && !config.beast.acknowledged_cli_risk) {
    const accepted = await deps.confirm(
      '⚠️  claude-cli provider spawns subprocesses outside the API billing path.\n' +
      'You accept responsibility for CLI token usage and rate limits.\n' +
      'Continue with claude-cli provider? [y/N]',
    );
    if (!accepted) throw new Error('Beast mode activation aborted');
    config.beast.acknowledged_cli_risk = true;
  }

  config.mode = 'beast';
  config.beast.enabled = true;
  config.beast.provider = provider;
  config.save();

  console.log(`Beast mode activated (provider: ${provider}).`);

  try {
    await deps.exec('frankenbeast', ['beasts', 'catalog']);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('binary not found') || msg.includes('ENOENT')) {
      console.log('\nTo launch the orchestrator, install the frankenbeast CLI:');
      console.log('  npm link --workspace=franken-orchestrator');
      console.log('  frankenbeast beasts catalog');
    } else {
      throw err;
    }
  }
}
