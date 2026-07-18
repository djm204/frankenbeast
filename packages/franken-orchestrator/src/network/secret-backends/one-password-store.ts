import type { CliResult } from './cli-runner.js';
import type { ISecretStore, SecretStoreDetection } from '../secret-store.js';

type CliRunner = (command: string, args: string[]) => Promise<CliResult>;
type StdinRunner = (command: string, args: string[], stdin: string) => Promise<CliResult>;

const VAULT = 'frankenbeast';
const TITLE_PREFIX = 'frankenbeast/';

const REQUIRED_OP_EDIT_STDIN_VERSION = [2, 23, 0] as const;
const BACKEND_MARKER_ID = 'frankenbeast-managed';
const BACKEND_MARKER_VALUE = 'secret-store-v1';

interface OnePasswordItemTemplate {
  id?: string;
  title?: string;
  category?: string;
  fields?: Array<{
    id?: string;
    type?: string;
    purpose?: string;
    label?: string;
    value?: string;
  }>;
}

function titleForKey(key: string): string {
  return `${TITLE_PREFIX}${key}`;
}

function itemIdFromJson(stdout: string): string | undefined {
  try {
    const item = JSON.parse(stdout) as { id?: unknown };
    return typeof item.id === 'string' && item.id.length > 0 ? item.id : undefined;
  } catch {
    return undefined;
  }
}

function itemTemplateForSecret(title: string, value: string): OnePasswordItemTemplate {
  return {
    title,
    category: 'LOGIN',
    fields: [
      {
        id: 'password',
        type: 'CONCEALED',
        purpose: 'PASSWORD',
        label: 'password',
        value,
      },
      {
        id: BACKEND_MARKER_ID,
        type: 'STRING',
        label: BACKEND_MARKER_ID,
        value: BACKEND_MARKER_VALUE,
      },
    ],
  };
}

function itemTemplateForExistingSecret(_stdout: string, _fallbackTitle: string, _value: string): OnePasswordItemTemplate {
  // 1Password JSON-template edits overwrite unsupported data such as passkeys,
  // and field assignment edits would put secret values in argv. Fail closed for
  // existing items until the CLI exposes a reliable stdin update primitive that
  // can prove unsupported item data will be preserved.
  throw new Error('1Password item already exists; refusing to edit existing items because safe stdin updates cannot reliably preserve unsupported item data such as passkeys. Delete and recreate the item to rotate this secret.');
}

function parseVersion(stdout: string): [number, number, number] | undefined {
  const match = stdout.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function versionAtLeast(actual: [number, number, number] | undefined, required: readonly [number, number, number]): boolean {
  if (!actual) return false;
  for (let i = 0; i < required.length; i += 1) {
    if (actual[i]! > required[i]!) return true;
    if (actual[i]! < required[i]!) return false;
  }
  return true;
}

function assertSuccess(result: CliResult, operation: string): void {
  if (result.exitCode !== 0) {
    throw new Error(`${operation} failed: ${result.stderr || result.stdout}`);
  }
}

export class OnePasswordStore implements ISecretStore {
  readonly id = '1password';

  constructor(
    private readonly runner: CliRunner,
    private readonly stdinRunner?: StdinRunner | undefined,
  ) {}

  async detect(): Promise<SecretStoreDetection> {
    const result = await this.runner('op', ['--version']);
    if (result.exitCode === 0) {
      if (!versionAtLeast(parseVersion(result.stdout), REQUIRED_OP_EDIT_STDIN_VERSION)) {
        return {
          available: false,
          reason: `1Password CLI ${result.stdout.trim() || 'version unknown'} does not support JSON-template creates from stdin`,
          setupInstructions: 'Install 1Password CLI 2.23.0 or newer so secret creates can use stdin without exposing values in process arguments.',
        };
      }
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
    if (!this.stdinRunner) {
      throw new Error('1Password store writes require a stdin-capable runner to avoid exposing secret values in process arguments.');
    }

    const title = titleForKey(key);
    const getResult = await this.runner('op', ['item', 'get', title, `--vault=${VAULT}`, '--format=json']);

    if (getResult.exitCode === 0) {
      itemTemplateForExistingSecret(getResult.stdout, title, value);
      return;
    }

    // Item does not exist — create it from a piped JSON template instead of argv assignments.
    const template = itemTemplateForSecret(title, value);
    const result = await this.stdinRunner('op', [
      'item',
      'create',
      `--vault=${VAULT}`,
      '-',
    ], JSON.stringify(template));
    assertSuccess(result, '1Password item create');
  }

  async resolve(key: string): Promise<string | undefined> {
    const title = titleForKey(key);
    const itemResult = await this.runner('op', [
      'item',
      'get',
      title,
      `--vault=${VAULT}`,
      '--format=json',
    ]);

    if (itemResult.exitCode !== 0) {
      return undefined;
    }
    const itemId = itemIdFromJson(itemResult.stdout);
    if (!itemId) {
      return undefined;
    }
    const result = await this.runner('op', ['read', `op://${VAULT}/${itemId}/password`]);
    if (result.exitCode !== 0) {
      return undefined;
    }
    return result.stdout.replace(/\n$/, '');
  }

  async delete(key: string): Promise<void> {
    const title = titleForKey(key);
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
