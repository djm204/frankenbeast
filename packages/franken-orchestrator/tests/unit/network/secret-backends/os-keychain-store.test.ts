import { describe, expect, it, beforeEach } from 'vitest';
import { OsKeychainStore } from '../../../../src/network/secret-backends/os-keychain-store.js';
import type { CliResult } from '../../../../src/network/secret-backends/cli-runner.js';

// Same mock runner pattern as OnePasswordStore/BitwardenStore tests
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

describe('OsKeychainStore', () => {
  describe('linux platform', () => {
    let mock: ReturnType<typeof createMockRunner>;
    let store: OsKeychainStore;

    beforeEach(() => {
      mock = createMockRunner();
      store = new OsKeychainStore({ runner: mock.runner, platform: 'linux' });
    });

    it('detects via secret-tool availability', async () => {
      mock.responses.set('--version', { stdout: '0.19', stderr: '', exitCode: 0 });
      const detection = await store.detect();
      expect(detection.available).toBe(true);
    });

    it('provides setup instructions when secret-tool missing', async () => {
      const detection = await store.detect();
      expect(detection.available).toBe(false);
      expect(detection.setupInstructions).toContain('secret-tool');
    });

    it('stores via secret-tool store', async () => {
      mock.responses.set('store', { stdout: '', stderr: '', exitCode: 0 });
      await store.store('comms.slack.botTokenRef', 'xoxb-test');
      const storeCall = mock.calls.find(c => c.args.includes('store'));
      expect(storeCall).toBeDefined();
    });

    it('resolves via secret-tool lookup', async () => {
      mock.responses.set('lookup', { stdout: 'xoxb-resolved\n', stderr: '', exitCode: 0 });
      const value = await store.resolve('comms.slack.botTokenRef');
      expect(value).toBe('xoxb-resolved');
    });

    it('returns undefined when key not found', async () => {
      const value = await store.resolve('nonexistent');
      expect(value).toBeUndefined();
    });

    it('deletes via secret-tool clear', async () => {
      mock.responses.set('clear', { stdout: '', stderr: '', exitCode: 0 });
      await expect(store.delete('comms.slack.botTokenRef')).resolves.not.toThrow();
    });
  });

  describe('darwin platform', () => {
    let mock: ReturnType<typeof createMockRunner>;
    let store: OsKeychainStore;

    beforeEach(() => {
      mock = createMockRunner();
      store = new OsKeychainStore({ runner: mock.runner, platform: 'darwin' });
    });

    it('detects via security command', async () => {
      mock.responses.set('help', { stdout: '', stderr: 'Usage:', exitCode: 0 });
      const detection = await store.detect();
      expect(detection.available).toBe(true);
    });

    it('stores via security add-generic-password -U', async () => {
      mock.responses.set('add-generic-password', { stdout: '', stderr: '', exitCode: 0 });
      await store.store('key', 'value');
      const addCall = mock.calls.find(c => c.args.includes('add-generic-password'));
      expect(addCall).toBeDefined();
      // -U flag for upsert
      expect(addCall!.args).toContain('-U');
    });

    it('resolves via security find-generic-password -w', async () => {
      mock.responses.set('find-generic-password', { stdout: 'resolved-value\n', stderr: '', exitCode: 0 });
      const value = await store.resolve('key');
      expect(value).toBe('resolved-value');
    });
  });

  describe('win32 platform', () => {
    let mock: ReturnType<typeof createMockRunner>;
    let store: OsKeychainStore;

    beforeEach(() => {
      mock = createMockRunner();
      store = new OsKeychainStore({ runner: mock.runner, platform: 'win32' });
    });

    it('detects via cmdkey', async () => {
      mock.responses.set('cmdkey', { stdout: 'Currently stored credentials', stderr: '', exitCode: 0 });
      const detection = await store.detect();
      expect(detection.available).toBe(true);
    });

    it('stores via cmdkey /generic', async () => {
      mock.responses.set('cmdkey', { stdout: '', stderr: '', exitCode: 0 });
      await store.store('key', 'value');
      const addCall = mock.calls.find(c => c.args.some(a => a.includes('/generic:')));
      expect(addCall).toBeDefined();
    });
  });

  describe('unsupported platform', () => {
    it('reports unavailable for unknown platform', async () => {
      const mock = createMockRunner();
      const store = new OsKeychainStore({ runner: mock.runner, platform: 'freebsd' as any });
      const detection = await store.detect();
      expect(detection.available).toBe(false);
    });
  });
});
