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
  passkeys?: unknown;
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
    passkeys: [],
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

function itemTemplateForExistingSecret(stdout: string, fallbackTitle: string, value: string): OnePasswordItemTemplate {
  let item: OnePasswordItemTemplate;
  try {
    item = JSON.parse(stdout) as OnePasswordItemTemplate;
  } catch {
    throw new Error('1Password item already exists but its JSON could not be parsed; refusing to edit because the existing item cannot be safely preserved.');
  }

  const passkeys = item.passkeys;
  if (!Object.prototype.hasOwnProperty.call(item, 'passkeys') || !Array.isArray(passkeys)) {
    throw new Error('1Password item already exists without explicit passkey metadata; refusing to template-edit because passkeys or unsupported item data cannot be reliably detected. Delete and recreate the item to rotate this secret.');
  }
  if (passkeys.length > 0) {
    throw new Error('1Password item already exists with passkeys; refusing to edit because unsupported item data cannot be safely preserved. Delete and recreate the item to rotate this secret.');
  }

  if (!Array.isArray(item.fields)) {
    throw new Error('1Password item already exists without editable fields; refusing to edit because the existing item cannot be safely preserved.');
  }

  const hasBackendMarker = item.fields.some(field =>
    field.id === BACKEND_MARKER_ID
    && field.label === BACKEND_MARKER_ID
    && field.value === BACKEND_MARKER_VALUE);
  if (!hasBackendMarker) {
    throw new Error('1Password item already exists but is not marked as frankenbeast-managed; refusing to template-edit because passkeys or unsupported item data cannot be reliably detected. Delete and recreate the item to rotate this secret.');
  }

  const passwordFieldIndex = item.fields.findIndex((field) =>
    field.id === 'password'
    || field.purpose === 'PASSWORD'
    || field.label === 'password');
  if (passwordFieldIndex < 0) {
    throw new Error('1Password item already exists without a password field; refusing to edit because the existing item cannot be safely preserved.');
  }

  return {
    ...item,
    title: item.title ?? fallbackTitle,
    category: item.category ?? 'LOGIN',
    fields: item.fields.map((field, index) => (
      index === passwordFieldIndex
        ? { ...field, value }
        : field
    )),
  };
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
          reason: `1Password CLI ${result.stdout.trim() || 'version unknown'} does not support JSON-template edits from stdin`,
          setupInstructions: 'Install 1Password CLI 2.23.0 or newer so secret upserts can use stdin without exposing values in process arguments.',
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
      const itemId = itemIdFromJson(getResult.stdout) ?? title;
      const template = itemTemplateForExistingSecret(getResult.stdout, title, value);
      const result = await this.stdinRunner('op', [
        'item',
        'edit',
        itemId,
        `--vault=${VAULT}`,
      ], JSON.stringify(template));
      assertSuccess(result, '1Password item edit');
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
