import { describe, expect, it, beforeEach } from 'vitest';
import { OnePasswordStore } from '../../../../src/network/secret-backends/one-password-store.js';
import type { CliResult } from '../../../../src/network/secret-backends/cli-runner.js';

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

      await store.store('comms.slack.botTokenRef', 'xoxb-test');
      const createCall = mock.calls.find(c => c.args.includes('create'));
      expect(createCall).toBeDefined();
    });

    it('edits existing item when key already exists', async () => {
      mock.responses.set('item get', { stdout: '{"id":"abc123"}', stderr: '', exitCode: 0 });
      mock.responses.set('item edit', { stdout: '{}', stderr: '', exitCode: 0 });

      await store.store('comms.slack.botTokenRef', 'xoxb-updated');
      const editCall = mock.calls.find(c => c.args.includes('edit'));
      expect(editCall).toBeDefined();
    });

    it('resolves a stored secret via op read', async () => {
      mock.responses.set('read', { stdout: 'xoxb-resolved', stderr: '', exitCode: 0 });
      const value = await store.resolve('comms.slack.botTokenRef');
      expect(value).toBe('xoxb-resolved');
    });

    it('returns undefined when secret not found', async () => {
      mock.responses.set('read', { stdout: '', stderr: 'not found', exitCode: 1 });
      const value = await store.resolve('nonexistent');
      expect(value).toBeUndefined();
    });
  });

  describe('delete', () => {
    it('deletes an existing secret', async () => {
      mock.responses.set('item delete', { stdout: '', stderr: '', exitCode: 0 });
      await expect(store.delete('comms.slack.botTokenRef')).resolves.not.toThrow();
    });
  });

  describe('keys', () => {
    it('lists all frankenbeast keys', async () => {
      mock.responses.set('item list', {
        stdout: JSON.stringify([
          { title: 'frankenbeast/comms.slack.botTokenRef' },
          { title: 'frankenbeast/network.operatorTokenRef' },
        ]),
        stderr: '',
        exitCode: 0,
      });
      const allKeys = await store.keys();
      expect(allKeys).toEqual(['comms.slack.botTokenRef', 'network.operatorTokenRef']);
    });
  });
});
