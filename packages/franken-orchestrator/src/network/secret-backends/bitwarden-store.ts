import type { CliResult } from './cli-runner.js';
import type { ISecretStore, SecretStoreDetection } from '../secret-store.js';

type CliRunner = (command: string, args: string[]) => Promise<CliResult>;

const TITLE_PREFIX = 'frankenbeast/';

interface BwItem {
  id: string;
  name: string;
  notes?: string;
}

export class BitwardenStore implements ISecretStore {
  readonly id = 'bitwarden';

  constructor(private readonly runner: CliRunner) {}

  async detect(): Promise<SecretStoreDetection> {
    const result = await this.runner('bw', ['--version']);
    if (result.exitCode === 0) {
      return { available: true };
    }
    return {
      available: false,
      reason: 'bw CLI not found',
      setupInstructions:
        'Install Bitwarden CLI: https://bitwarden.com/help/cli/',
    };
  }

  async store(key: string, value: string): Promise<void> {
    const name = `${TITLE_PREFIX}${key}`;
    const getResult = await this.runner('bw', ['get', 'item', name]);

    if (getResult.exitCode === 0) {
      // Item exists — edit it
      const existing = JSON.parse(getResult.stdout) as BwItem;
      const payload = { ...existing, notes: value };
      const encoded = Buffer.from(JSON.stringify(payload)).toString('base64');
      await this.runner('bw', ['edit', 'item', existing.id, encoded]);
    } else {
      // Item does not exist — create it
      const payload = {
        type: 2,
        name,
        notes: value,
        secureNote: { type: 0 },
      };
      const encoded = Buffer.from(JSON.stringify(payload)).toString('base64');
      await this.runner('bw', ['create', 'item', encoded]);
    }
  }

  async resolve(key: string): Promise<string | undefined> {
    const name = `${TITLE_PREFIX}${key}`;
    const result = await this.runner('bw', ['get', 'item', name]);
    if (result.exitCode !== 0) {
      return undefined;
    }
    const item = JSON.parse(result.stdout) as BwItem;
    return item.notes;
  }

  async delete(key: string): Promise<void> {
    const name = `${TITLE_PREFIX}${key}`;
    const getResult = await this.runner('bw', ['get', 'item', name]);
    if (getResult.exitCode !== 0) {
      return;
    }
    const item = JSON.parse(getResult.stdout) as BwItem;
    await this.runner('bw', ['delete', 'item', item.id]);
  }

  async keys(): Promise<string[]> {
    const result = await this.runner('bw', ['list', 'items', '--search', 'frankenbeast']);
    if (result.exitCode !== 0) {
      return [];
    }
    const items = JSON.parse(result.stdout) as Array<{ name: string }>;
    return items
      .map(item => item.name)
      .filter(name => name.startsWith(TITLE_PREFIX))
      .map(name => name.slice(TITLE_PREFIX.length));
  }
}
