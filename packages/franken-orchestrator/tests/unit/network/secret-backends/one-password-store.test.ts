import { describe, expect, it, beforeEach } from 'vitest';
import { OnePasswordStore } from '../../../../src/network/secret-backends/one-password-store.js';
import type { CliResult } from '../../../../src/network/secret-backends/cli-runner.js';
import { testCredential } from '../../../support/test-credentials.js';

const TEST_SLACK_BOT_TOKEN = testCredential('TEST_SLACK_BOT_TOKEN');
const UPDATED_SLACK_BOT_TOKEN = testCredential('UPDATED_SLACK_BOT_TOKEN');
const RESOLVED_SLACK_BOT_TOKEN = testCredential('RESOLVED_SLACK_BOT_TOKEN');

function createMockRunner() {
  const calls: Array<{ command: string; args: string[]; stdin?: string }> = [];
  const responses = new Map<string, CliResult>();

  const runner = async (command: string, args: string[]): Promise<CliResult> => {
    calls.push({ command, args });
    const key = `${command} ${args.join(' ')}`;
    for (const [pattern, result] of responses) {
      if (key.includes(pattern)) return result;
    }
    return { stdout: '', stderr: 'not found', exitCode: 1 };
  };

  const stdinRunner = async (command: string, args: string[], stdin: string): Promise<CliResult> => {
    calls.push({ command, args, stdin });
    const key = `${command} ${args.join(' ')}`;
    for (const [pattern, result] of responses) {
      if (key.includes(pattern)) return result;
    }
    return { stdout: '', stderr: '', exitCode: 0 };
  };

  return { runner, stdinRunner, calls, responses };
}

function expectNoArgContains(calls: Array<{ args: string[] }>, secret: string) {
  for (const call of calls) {
    expect(call.args.join('\0')).not.toContain(secret);
  }
}

describe('OnePasswordStore', () => {
  let mock: ReturnType<typeof createMockRunner>;
  let store: OnePasswordStore;

  beforeEach(() => {
    mock = createMockRunner();
    store = new OnePasswordStore(mock.runner, mock.stdinRunner);
  });

  describe('detect', () => {
    it('reports available when op CLI is found', async () => {
      mock.responses.set('--version', { stdout: '2.30.0', stderr: '', exitCode: 0 });
      const detection = await store.detect();
      expect(detection.available).toBe(true);
    });

    it('reports unavailable with setup instructions when op not found', async () => {
      const detection = await store.detect();
      expect(detection.available).toBe(false);
      expect(detection.setupInstructions).toContain('1Password CLI');
    });

    it('requires a 1Password CLI version with stdin JSON-template edits', async () => {
      mock.responses.set('--version', { stdout: '2.22.0', stderr: '', exitCode: 0 });
      const detection = await store.detect();
      expect(detection.available).toBe(false);
      expect(detection.setupInstructions).toContain('2.23.0');
    });
  });

  describe('store and resolve', () => {
    it('creates new item from a JSON template supplied through stdin', async () => {
      mock.responses.set('item get', { stdout: '', stderr: 'not found', exitCode: 1 });
      mock.responses.set('item create', { stdout: '{}', stderr: '', exitCode: 0 });

      await store.store('comms.slack.botTokenRef', TEST_SLACK_BOT_TOKEN);
      const createCall = mock.calls.find(c => c.args.includes('create'));
      expect(createCall).toBeDefined();
      expect(createCall).toMatchObject({
        command: 'op',
        args: [
          'item',
          'create',
          '--vault=frankenbeast',
          '-',
        ],
      });
      expect(JSON.parse(createCall!.stdin!)).toMatchObject({
        title: 'frankenbeast/comms.slack.botTokenRef',
        category: 'LOGIN',
        fields: [
          {
            id: 'password',
            type: 'CONCEALED',
            purpose: 'PASSWORD',
            label: 'password',
            value: TEST_SLACK_BOT_TOKEN,
          },
          {
            id: 'frankenbeast-managed',
            type: 'STRING',
            label: 'frankenbeast-managed',
            value: 'secret-store-v1',
          },
        ],
      });
      expectNoArgContains(mock.calls, TEST_SLACK_BOT_TOKEN);
    });

    it('upserts existing backend-owned 1Password items via stdin JSON edits', async () => {
      mock.responses.set('item get', {
        stdout: JSON.stringify({
          id: 'abc123',
          title: 'frankenbeast/comms.slack.botTokenRef',
          category: 'LOGIN',
          passkeys: [],
          fields: [
            { id: 'password', type: 'CONCEALED', purpose: 'PASSWORD', label: 'password', value: 'old' },
            { id: 'frankenbeast-managed', type: 'STRING', label: 'frankenbeast-managed', value: 'secret-store-v1' },
          ],
        }),
        stderr: '',
        exitCode: 0,
      });
      mock.responses.set('item edit', { stdout: '{}', stderr: '', exitCode: 0 });

      await store.store('comms.slack.botTokenRef', UPDATED_SLACK_BOT_TOKEN);

      const editCall = mock.calls.find(c => c.args.includes('edit'));
      expect(editCall).toBeDefined();
      expect(editCall).toMatchObject({
        command: 'op',
        args: ['item', 'edit', 'abc123', '--vault=frankenbeast'],
      });
      expect(JSON.parse(editCall!.stdin!)).toMatchObject({
        id: 'abc123',
        title: 'frankenbeast/comms.slack.botTokenRef',
        category: 'LOGIN',
        passkeys: [],
        fields: [
          { id: 'password', type: 'CONCEALED', purpose: 'PASSWORD', label: 'password', value: UPDATED_SLACK_BOT_TOKEN },
          { id: 'frankenbeast-managed', type: 'STRING', label: 'frankenbeast-managed', value: 'secret-store-v1' },
        ],
      });
      expectNoArgContains(mock.calls, UPDATED_SLACK_BOT_TOKEN);
    });

    it('migrates legacy backend-owned 1Password items after passkey metadata confirms no passkeys', async () => {
      mock.responses.set('item get', {
        stdout: JSON.stringify({
          id: 'abc123',
          title: 'frankenbeast/comms.slack.botTokenRef',
          category: 'LOGIN',
          passkeys: [],
          fields: [
            { id: 'password', type: 'CONCEALED', purpose: 'PASSWORD', label: 'password', value: 'old' },
          ],
        }),
        stderr: '',
        exitCode: 0,
      });
      mock.responses.set('item edit', { stdout: '{}', stderr: '', exitCode: 0 });

      await store.store('comms.slack.botTokenRef', UPDATED_SLACK_BOT_TOKEN);

      const editCall = mock.calls.find(c => c.args.includes('edit'));
      expect(editCall).toBeDefined();
      expect(JSON.parse(editCall!.stdin!)).toMatchObject({
        id: 'abc123',
        title: 'frankenbeast/comms.slack.botTokenRef',
        category: 'LOGIN',
        passkeys: [],
        fields: [
          { id: 'password', value: UPDATED_SLACK_BOT_TOKEN },
          { id: 'frankenbeast-managed', value: 'secret-store-v1' },
        ],
      });
      expectNoArgContains(mock.calls, UPDATED_SLACK_BOT_TOKEN);
    });

    it('allows backend-owned existing items without passkey metadata', async () => {
      mock.responses.set('item get', {
        stdout: JSON.stringify({
          id: 'abc123',
          title: 'frankenbeast/comms.slack.botTokenRef',
          category: 'LOGIN',
          fields: [
            { id: 'password', type: 'CONCEALED', purpose: 'PASSWORD', label: 'password', value: 'old' },
            { id: 'frankenbeast-managed', type: 'STRING', label: 'frankenbeast-managed', value: 'secret-store-v1' },
          ],
        }),
        stderr: '',
        exitCode: 0,
      });
      mock.responses.set('item edit', { stdout: '{}', stderr: '', exitCode: 0 });

      await store.store('comms.slack.botTokenRef', UPDATED_SLACK_BOT_TOKEN);

      const editCall = mock.calls.find(c => c.args.includes('edit'));
      expect(editCall).toBeDefined();
      expect(JSON.parse(editCall!.stdin!)).toMatchObject({
        fields: [
          { id: 'password', value: UPDATED_SLACK_BOT_TOKEN },
          { id: 'frankenbeast-managed', value: 'secret-store-v1' },
        ],
      });
      expectNoArgContains(mock.calls, UPDATED_SLACK_BOT_TOKEN);
    });

    it('fails closed rather than whole-template editing 1Password items with passkeys', async () => {
      mock.responses.set('item get', {
        stdout: JSON.stringify({
          id: 'abc123',
          title: 'frankenbeast/comms.slack.botTokenRef',
          category: 'LOGIN',
          fields: [{ id: 'password', type: 'CONCEALED', purpose: 'PASSWORD', label: 'password', value: 'old' }],
          passkeys: [{ credentialId: 'passkey-credential' }],
        }),
        stderr: '',
        exitCode: 0,
      });

      await expect(store.store('comms.slack.botTokenRef', UPDATED_SLACK_BOT_TOKEN)).rejects.toThrow('with passkeys');
      expect(mock.calls.some(c => c.args.includes('edit'))).toBe(false);
      expectNoArgContains(mock.calls, UPDATED_SLACK_BOT_TOKEN);
    });

    it('surfaces failed 1Password stdin edits', async () => {
      mock.responses.set('item get', {
        stdout: JSON.stringify({
          id: 'abc123',
          title: 'frankenbeast/comms.slack.botTokenRef',
          category: 'LOGIN',
          passkeys: [],
          fields: [
            { id: 'password', type: 'CONCEALED', purpose: 'PASSWORD', label: 'password', value: 'old' },
            { id: 'frankenbeast-managed', type: 'STRING', label: 'frankenbeast-managed', value: 'secret-store-v1' },
          ],
        }),
        stderr: '',
        exitCode: 0,
      });
      mock.responses.set('item edit', { stdout: '', stderr: 'edit rejected', exitCode: 1 });

      await expect(store.store('comms.slack.botTokenRef', UPDATED_SLACK_BOT_TOKEN)).rejects.toThrow('1Password item edit failed: edit rejected');
      expectNoArgContains(mock.calls, UPDATED_SLACK_BOT_TOKEN);
    });

    it('surfaces failed 1Password stdin creates', async () => {
      mock.responses.set('item get', { stdout: '', stderr: 'not found', exitCode: 1 });
      mock.responses.set('item create', { stdout: '', stderr: 'unsupported template', exitCode: 1 });

      await expect(store.store('comms.slack.botTokenRef', TEST_SLACK_BOT_TOKEN)).rejects.toThrow('1Password item create failed: unsupported template');
      expectNoArgContains(mock.calls, TEST_SLACK_BOT_TOKEN);
    });

    it('fails closed when storing without a stdin-capable runner', async () => {
      const unsafeStore = new OnePasswordStore(mock.runner);
      await expect(unsafeStore.store('key', TEST_SLACK_BOT_TOKEN)).rejects.toThrow('stdin-capable runner');
      expectNoArgContains(mock.calls, TEST_SLACK_BOT_TOKEN);
    });

    it('resolves a stored secret via op item get', async () => {
      mock.responses.set('--format=json', {
        stdout: JSON.stringify({ id: 'item-id-123' }),
        stderr: '',
        exitCode: 0,
      });
      mock.responses.set('read', {
        stdout: RESOLVED_SLACK_BOT_TOKEN,
        stderr: '',
        exitCode: 0,
      });
      const value = await store.resolve('comms.slack.botTokenRef');
      expect(value).toBe(RESOLVED_SLACK_BOT_TOKEN);
    });

    it('uses the same raw item title for URL-unsafe keys across store and resolve', async () => {
      const key = 'comms/slack@workspace.botTokenRef';
      const title = 'frankenbeast/comms/slack@workspace.botTokenRef';
      mock.responses.set('item get', { stdout: '', stderr: 'not found', exitCode: 1 });
      mock.responses.set('item create', { stdout: '{}', stderr: '', exitCode: 0 });

      await store.store(key, TEST_SLACK_BOT_TOKEN);
      mock.responses.delete('item get');
      mock.responses.set('--format=json', {
        stdout: JSON.stringify({ id: 'unsafe-item-id' }),
        stderr: '',
        exitCode: 0,
      });
      mock.responses.set('read', {
        stdout: RESOLVED_SLACK_BOT_TOKEN,
        stderr: '',
        exitCode: 0,
      });
      const value = await store.resolve(key);

      expect(value).toBe(RESOLVED_SLACK_BOT_TOKEN);
      expect(mock.calls).toContainEqual({
        command: 'op',
        args: ['item', 'get', title, '--vault=frankenbeast', '--format=json'],
      });
      expect(mock.calls.some(c => c.command === 'op' && c.args.join('\0') === ['item', 'create', '--vault=frankenbeast', '-'].join('\0'))).toBe(true);
      expect(mock.calls).toContainEqual({
        command: 'op',
        args: [
          'item',
          'get',
          title,
          '--vault=frankenbeast',
          '--format=json',
        ],
      });
      expect(mock.calls).toContainEqual({
        command: 'op',
        args: ['read', 'op://frankenbeast/unsafe-item-id/password'],
      });
    });

    it('resolves keys with spaces and URL-reserved symbols through the raw stored title', async () => {
      const key = 'providers.openai/workspace token?region=us east&scope=chat';
      const title = 'frankenbeast/providers.openai/workspace token?region=us east&scope=chat';
      mock.responses.set('item get', { stdout: '', stderr: 'not found', exitCode: 1 });
      mock.responses.set('item create', { stdout: '{}', stderr: '', exitCode: 0 });

      await store.store(key, TEST_SLACK_BOT_TOKEN);
      mock.responses.delete('item get');
      mock.responses.set('--format=json', {
        stdout: JSON.stringify({ id: 'reserved-symbol-item-id' }),
        stderr: '',
        exitCode: 0,
      });
      mock.responses.set('read', {
        stdout: RESOLVED_SLACK_BOT_TOKEN,
        stderr: '',
        exitCode: 0,
      });
      const value = await store.resolve(key);

      expect(value).toBe(RESOLVED_SLACK_BOT_TOKEN);
      expect(mock.calls).toContainEqual({
        command: 'op',
        args: ['item', 'get', title, '--vault=frankenbeast', '--format=json'],
      });
      expect(mock.calls.some(c => c.command === 'op' && c.args.join('\0') === ['item', 'create', '--vault=frankenbeast', '-'].join('\0'))).toBe(true);
      expect(mock.calls).toContainEqual({
        command: 'op',
        args: [
          'item',
          'get',
          title,
          '--vault=frankenbeast',
          '--format=json',
        ],
      });
      expect(mock.calls).toContainEqual({
        command: 'op',
        args: ['read', 'op://frankenbeast/reserved-symbol-item-id/password'],
      });
    });

    it('returns undefined when secret not found', async () => {
      mock.responses.set('--format=json', { stdout: '', stderr: 'not found', exitCode: 1 });
      const value = await store.resolve('nonexistent');
      expect(value).toBeUndefined();
    });

    it('returns undefined when op item metadata is malformed', async () => {
      mock.responses.set('--format=json', { stdout: 'not json', stderr: '', exitCode: 0 });
      const value = await store.resolve('comms.slack.botTokenRef');
      expect(value).toBeUndefined();
    });
  });

  describe('delete', () => {
    it('deletes an existing secret', async () => {
      mock.responses.set('item delete', { stdout: '', stderr: '', exitCode: 0 });
      await expect(store.delete('comms.slack.botTokenRef')).resolves.not.toThrow();
    });

    it('deletes URL-unsafe keys using the raw item title', async () => {
      mock.responses.set('item delete', { stdout: '', stderr: '', exitCode: 0 });
      await store.delete('comms/slack@workspace.botTokenRef');
      expect(mock.calls).toContainEqual({
        command: 'op',
        args: [
          'item',
          'delete',
          'frankenbeast/comms/slack@workspace.botTokenRef',
          '--vault=frankenbeast',
        ],
      });
    });
  });

  describe('keys', () => {
    it('lists all frankenbeast keys', async () => {
      mock.responses.set('item list', {
        stdout: JSON.stringify([
          { title: 'frankenbeast/comms.slack.botTokenRef' },
          { title: 'frankenbeast/network.operatorTokenRef' },
          { title: 'frankenbeast/comms/slack@workspace.botTokenRef' },
        ]),
        stderr: '',
        exitCode: 0,
      });
      const allKeys = await store.keys();
      expect(allKeys).toEqual([
        'comms.slack.botTokenRef',
        'network.operatorTokenRef',
        'comms/slack@workspace.botTokenRef',
      ]);
    });
  });
});
