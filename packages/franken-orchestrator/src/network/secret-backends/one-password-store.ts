import type { CliResult } from './cli-runner.js';
import type { ISecretStore, SecretStoreDetection } from '../secret-store.js';

type CliRunner = (command: string, args: string[]) => Promise<CliResult>;

const VAULT = 'frankenbeast';
const TITLE_PREFIX = 'frankenbeast/';

export class OnePasswordStore implements ISecretStore {
  readonly id = '1password';

  constructor(private readonly runner: CliRunner) {}

  async detect(): Promise<SecretStoreDetection> {
    const result = await this.runner('op', ['--version']);
    if (result.exitCode === 0) {
      return { available: true };
    }
    return {
      available: false,
      reason: 'op CLI not found',
      setupInstructions:
        'Install 1Password CLI: https://developer.1password.com/docs/cli/get-started/',
    };
  }

  async store(key: string, value: string): Promise<void> {
    const title = `${TITLE_PREFIX}${key}`;
    const getResult = await this.runner('op', ['item', 'get', title, `--vault=${VAULT}`]);

    if (getResult.exitCode === 0) {
      // Item exists — edit it
      await this.runner('op', [
        'item',
        'edit',
        title,
        `--vault=${VAULT}`,
        `password=${value}`,
      ]);
    } else {
      // Item does not exist — create it
      await this.runner('op', [
        'item',
        'create',
        '--category=Login',
        `--title=${title}`,
        `--vault=${VAULT}`,
        `password=${value}`,
      ]);
    }
  }

  async resolve(key: string): Promise<string | undefined> {
    const encodedKey = encodeURIComponent(key);
    const ref = `op://${VAULT}/${TITLE_PREFIX}${encodedKey}/password`;
    const result = await this.runner('op', ['read', ref]);
    if (result.exitCode !== 0) {
      return undefined;
    }
    return result.stdout.replace(/\n$/, '');
  }

  async delete(key: string): Promise<void> {
    const title = `${TITLE_PREFIX}${key}`;
    await this.runner('op', ['item', 'delete', title, `--vault=${VAULT}`]);
  }

  async keys(): Promise<string[]> {
    const result = await this.runner('op', [
      'item',
      'list',
      `--vault=${VAULT}`,
      '--format=json',
    ]);
    if (result.exitCode !== 0) {
      return [];
    }
    const items = JSON.parse(result.stdout) as Array<{ title: string }>;
    return items
      .map(item => item.title)
      .filter(title => title.startsWith(TITLE_PREFIX))
      .map(title => title.slice(TITLE_PREFIX.length));
  }
}
