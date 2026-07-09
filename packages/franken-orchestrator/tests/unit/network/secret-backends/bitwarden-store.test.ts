import { describe, expect, it, beforeEach } from 'vitest';
import { BitwardenStore } from '../../../../src/network/secret-backends/bitwarden-store.js';
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

describe('BitwardenStore', () => {
  let mock: ReturnType<typeof createMockRunner>;
  let store: BitwardenStore;

  beforeEach(() => {
    mock = createMockRunner();
    store = new BitwardenStore(mock.runner);
  });

  describe('detect', () => {
    it('reports available when bw CLI is found', async () => {
      mock.responses.set('--version', { stdout: '2024.1.0', stderr: '', exitCode: 0 });
      const detection = await store.detect();
      expect(detection.available).toBe(true);
    });

    it('reports unavailable with setup instructions when bw not found', async () => {
      const detection = await store.detect();
      expect(detection.available).toBe(false);
      expect(detection.setupInstructions).toContain('bitwarden.com');
    });
  });

  describe('store', () => {
    it('creates new item when key does not exist', async () => {
      mock.responses.set('get item', { stdout: '', stderr: 'Not found.', exitCode: 1 });
      mock.responses.set('create item', { stdout: '{"id":"new123"}', stderr: '', exitCode: 0 });

      await store.store('comms.slack.botTokenRef', TEST_SLACK_BOT_TOKEN);
      const createCall = mock.calls.find(c => c.args.includes('create'));
      expect(createCall).toBeDefined();
      expect(createCall?.args).toContain('item');
      // Should pass base64-encoded payload
      const payload = createCall?.args[2];
      expect(payload).toBeDefined();
      const decoded = JSON.parse(Buffer.from(payload!, 'base64').toString('utf-8'));
      expect(decoded.type).toBe(2);
      expect(decoded.name).toBe('frankenbeast/comms.slack.botTokenRef');
      expect(decoded.notes).toBe(TEST_SLACK_BOT_TOKEN);
    });

    it('edits existing item when key already exists', async () => {
      mock.responses.set('get item', {
        stdout: JSON.stringify({ id: 'abc123', name: 'frankenbeast/comms.slack.botTokenRef', notes: 'old-value' }),
        stderr: '',
        exitCode: 0,
      });
      mock.responses.set('edit item', { stdout: '{}', stderr: '', exitCode: 0 });

      await store.store('comms.slack.botTokenRef', UPDATED_SLACK_BOT_TOKEN);
      const editCall = mock.calls.find(c => c.args.includes('edit'));
      expect(editCall).toBeDefined();
      expect(editCall?.args).toContain('abc123');
      // Should pass base64-encoded payload
      const payload = editCall?.args[3];
      expect(payload).toBeDefined();
      const decoded = JSON.parse(Buffer.from(payload!, 'base64').toString('utf-8'));
      expect(decoded.notes).toBe(UPDATED_SLACK_BOT_TOKEN);
    });
  });

  describe('resolve', () => {
    it('resolves a stored secret from notes field', async () => {
      mock.responses.set('get item', {
        stdout: JSON.stringify({ id: 'abc123', name: 'frankenbeast/comms.slack.botTokenRef', notes: RESOLVED_SLACK_BOT_TOKEN }),
        stderr: '',
        exitCode: 0,
      });
      const value = await store.resolve('comms.slack.botTokenRef');
      expect(value).toBe(RESOLVED_SLACK_BOT_TOKEN);
    });

    it('returns undefined when secret not found', async () => {
      mock.responses.set('get item', { stdout: '', stderr: 'Not found.', exitCode: 1 });
      const value = await store.resolve('nonexistent');
      expect(value).toBeUndefined();
    });
  });

  describe('delete', () => {
    it('deletes an existing secret by id', async () => {
      mock.responses.set('get item', {
        stdout: JSON.stringify({ id: 'abc123', name: 'frankenbeast/comms.slack.botTokenRef', notes: 'value' }),
        stderr: '',
        exitCode: 0,
      });
      mock.responses.set('delete item', { stdout: '', stderr: '', exitCode: 0 });

      await expect(store.delete('comms.slack.botTokenRef')).resolves.not.toThrow();
      const deleteCall = mock.calls.find(c => c.args.includes('delete'));
      expect(deleteCall).toBeDefined();
      expect(deleteCall?.args).toContain('abc123');
    });
  });

  describe('keys', () => {
    it('lists all frankenbeast keys', async () => {
      mock.responses.set('list items', {
        stdout: JSON.stringify([
          { id: '1', name: 'frankenbeast/comms.slack.botTokenRef' },
          { id: '2', name: 'frankenbeast/network.operatorTokenRef' },
          { id: '3', name: 'other-app/some-key' },
        ]),
        stderr: '',
        exitCode: 0,
      });
      const allKeys = await store.keys();
      expect(allKeys).toEqual(['comms.slack.botTokenRef', 'network.operatorTokenRef']);
    });

    it('returns empty array when list fails', async () => {
      const allKeys = await store.keys();
      expect(allKeys).toEqual([]);
    });
  });
});
