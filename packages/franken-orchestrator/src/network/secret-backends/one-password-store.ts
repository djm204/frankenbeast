import type { CliResult } from './cli-runner.js';
import type { ISecretStore, SecretStoreDetection } from '../secret-store.js';

type CliRunner = (command: string, args: string[]) => Promise<CliResult>;
type StdinRunner = (command: string, args: string[], stdin: string) => Promise<CliResult>;

const VAULT = 'frankenbeast';
const TITLE_PREFIX = 'frankenbeast/';

const REQUIRED_OP_EDIT_STDIN_VERSION = [2, 23, 0] as const;

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
  passkeys?: unknown;
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

function itemTemplateForSecret(title: string, value: string, existing?: OnePasswordItemTemplate): OnePasswordItemTemplate {
  const fields = [...(existing?.fields ?? [])];
  const passwordField = fields.find(
    field => field.id === 'password' || field.purpose === 'PASSWORD' || field.label === 'password',
  );

  if (passwordField) {
    passwordField.value = value;
    passwordField.type = passwordField.type ?? 'CONCEALED';
    passwordField.purpose = passwordField.purpose ?? 'PASSWORD';
  } else {
    fields.push({
      id: 'password',
      type: 'CONCEALED',
      purpose: 'PASSWORD',
      label: 'password',
      value,
    });
  }

  return {
    ...existing,
    title: existing?.title ?? title,
    category: existing?.category ?? 'LOGIN',
    fields,
  };
}

function parseItemTemplate(stdout: string): OnePasswordItemTemplate | undefined {
  try {
    const parsed = JSON.parse(stdout) as OnePasswordItemTemplate;
    return parsed && typeof parsed === 'object' ? parsed : undefined;
  } catch {
    return undefined;
  }
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

function hasPasskeys(item: OnePasswordItemTemplate | undefined): boolean {
  return Array.isArray(item?.passkeys) && item.passkeys.length > 0;
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
          setupInstructions: 'Install 1Password CLI 2.23.0 or newer so secret updates can use stdin without exposing values in process arguments.',
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
      // Item exists — edit it by piping a JSON template so sensitive fields never appear in argv.
      const existing = parseItemTemplate(getResult.stdout);
      if (hasPasskeys(existing)) {
        throw new Error('1Password item contains passkeys; refusing whole-template edit because the 1Password CLI does not preserve passkeys in JSON templates.');
      }
      const template = itemTemplateForSecret(title, value, existing);
      await this.stdinRunner('op', [
        'item',
        'edit',
        title,
        `--vault=${VAULT}`,
      ], JSON.stringify(template));
    } else {
      // Item does not exist — create it from a piped JSON template instead of argv assignments.
      const template = itemTemplateForSecret(title, value);
      await this.stdinRunner('op', [
        'item',
        'create',
        `--vault=${VAULT}`,
        '-',
      ], JSON.stringify(template));
    }
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
