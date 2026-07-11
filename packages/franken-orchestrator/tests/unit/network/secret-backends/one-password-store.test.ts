import { describe, expect, it, beforeEach } from 'vitest';
import { OnePasswordStore } from '../../../../src/network/secret-backends/one-password-store.js';
import type { CliResult } from '../../../../src/network/secret-backends/cli-runner.js';
import { testCredential } from '../../../support/test-credentials.js';

const TEST_SLACK_BOT_TOKEN = testCredential('TEST_SLACK_BOT_TOKEN');
const UPDATED_SLACK_BOT_TOKEN = testCredential('UPDATED_SLACK_BOT_TOKEN');
const RESOLVED_SLACK_BOT_TOKEN = testCredential('RESOLVED_SLACK_BOT_TOKEN');

function createMockRunner() {
  const calls: Array<{ command: string; args: string[] }> = [];
  const responses = new Map<string, CliResult>();

  const runner = async (command: string, args: string[]): Promise<CliResult> => {
    calls.push({ command, args });
    const key = `${command} ${args.join(' ')}`;
    for (const [pattern, result] of responses) {
      if (key.includes(pattern)) return result;
    }
    return { stdout: '', stderr: 'not found', exitCode: 1 };
  };

  return { runner, calls, responses };
}

describe('OnePasswordStore', () => {
  let mock: ReturnType<typeof createMockRunner>;
  let store: OnePasswordStore;

  beforeEach(() => {
    mock = createMockRunner();
    store = new OnePasswordStore(mock.runner);
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
  });

  describe('store and resolve', () => {
    it('creates new item when key does not exist', async () => {
      mock.responses.set('item get', { stdout: '', stderr: 'not found', exitCode: 1 });
      mock.responses.set('item create', { stdout: '{}', stderr: '', exitCode: 0 });

      await store.store('comms.slack.botTokenRef', TEST_SLACK_BOT_TOKEN);
      const createCall = mock.calls.find(c => c.args.includes('create'));
      expect(createCall).toBeDefined();
    });

    it('edits existing item when key already exists', async () => {
      mock.responses.set('item get', { stdout: '{"id":"abc123"}', stderr: '', exitCode: 0 });
      mock.responses.set('item edit', { stdout: '{}', stderr: '', exitCode: 0 });

      await store.store('comms.slack.botTokenRef', UPDATED_SLACK_BOT_TOKEN);
      const editCall = mock.calls.find(c => c.args.includes('edit'));
      expect(editCall).toBeDefined();
    });

    it('resolves a stored secret via op item get', async () => {
      mock.responses.set('--fields=password', {
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
      mock.responses.set('--fields=password', {
        stdout: RESOLVED_SLACK_BOT_TOKEN,
        stderr: '',
        exitCode: 0,
      });
      mock.responses.set('item get', { stdout: '', stderr: 'not found', exitCode: 1 });
      mock.responses.set('item create', { stdout: '{}', stderr: '', exitCode: 0 });

      await store.store(key, TEST_SLACK_BOT_TOKEN);
      const value = await store.resolve(key);

      expect(value).toBe(RESOLVED_SLACK_BOT_TOKEN);
      expect(mock.calls).toContainEqual({
        command: 'op',
        args: ['item', 'get', title, '--vault=frankenbeast'],
      });
      expect(mock.calls).toContainEqual({
        command: 'op',
        args: [
          'item',
          'create',
          '--category=Login',
          `--title=${title}`,
          '--vault=frankenbeast',
          `password=${TEST_SLACK_BOT_TOKEN}`,
        ],
      });
      expect(mock.calls).toContainEqual({
        command: 'op',
        args: [
          'item',
          'get',
          title,
          '--vault=frankenbeast',
          '--fields=password',
          '--reveal',
        ],
      });
    });

    it('returns undefined when secret not found', async () => {
      mock.responses.set('--fields=password', { stdout: '', stderr: 'not found', exitCode: 1 });
      const value = await store.resolve('nonexistent');
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
