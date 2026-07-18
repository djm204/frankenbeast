import { describe, expect, it, beforeEach } from 'vitest';
import { OsKeychainStore } from '../../../../src/network/secret-backends/os-keychain-store.js';
import type { CliResult } from '../../../../src/network/secret-backends/cli-runner.js';
import { testCredential } from '../../../support/test-credentials.js';

const TEST_SLACK_BOT_TOKEN = testCredential('TEST_SLACK_BOT_TOKEN');
const RESOLVED_SLACK_BOT_TOKEN = testCredential('RESOLVED_SLACK_BOT_TOKEN');

// Same mock runner pattern as OnePasswordStore/BitwardenStore tests
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

describe('OsKeychainStore', () => {
  describe('linux platform', () => {
    let mock: ReturnType<typeof createMockRunner>;
    let store: OsKeychainStore;

    beforeEach(() => {
      mock = createMockRunner();
      store = new OsKeychainStore({ runner: mock.runner, stdinRunner: mock.stdinRunner, platform: 'linux' });
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

    it('stores via secret-tool stdin without exposing the value in argv', async () => {
      mock.responses.set('store', { stdout: '', stderr: '', exitCode: 0 });
      await store.store('comms.slack.botTokenRef', TEST_SLACK_BOT_TOKEN);
      const storeCall = mock.calls.find(c => c.args.includes('store'));
      expect(storeCall).toBeDefined();
      expect(storeCall?.stdin).toBe(TEST_SLACK_BOT_TOKEN);
      expectNoArgContains(mock.calls, TEST_SLACK_BOT_TOKEN);
    });

    it('fails closed when storing without a stdin-capable runner', async () => {
      const unsafeStore = new OsKeychainStore({ runner: mock.runner, platform: 'linux' });
      await expect(unsafeStore.store('key', TEST_SLACK_BOT_TOKEN)).rejects.toThrow('stdin-capable runner');
      expectNoArgContains(mock.calls, TEST_SLACK_BOT_TOKEN);
    });

    it('resolves via secret-tool lookup', async () => {
      mock.responses.set('lookup', { stdout: `${RESOLVED_SLACK_BOT_TOKEN}\n`, stderr: '', exitCode: 0 });
      const value = await store.resolve('comms.slack.botTokenRef');
      expect(value).toBe(RESOLVED_SLACK_BOT_TOKEN);
    });

    it('returns undefined when key not found', async () => {
      const value = await store.resolve('nonexistent');
      expect(value).toBeUndefined();
    });

    it('deletes via secret-tool clear', async () => {
      mock.responses.set('clear', { stdout: '', stderr: '', exitCode: 0 });
      await expect(store.delete('comms.slack.botTokenRef')).resolves.not.toThrow();
    });

    it('updates key manifest on store and delete', async () => {
      mock.responses.set('store', { stdout: '', stderr: '', exitCode: 0 });
      mock.responses.set('clear', { stdout: '', stderr: '', exitCode: 0 });

      await store.store('my-key', 'my-value');
      const manifestStoreCall = mock.calls.find(
        c => c.args.includes('store') && c.args.includes('__frankenbeast_keys__'),
      );
      expect(manifestStoreCall).toBeDefined();
      expect(JSON.parse(manifestStoreCall!.stdin!)).toEqual(['my-key']);
      expectNoArgContains(mock.calls, 'my-value');

      mock.responses.set('lookup', {
        stdout: JSON.stringify(['my-key']) + '\n',
        stderr: '',
        exitCode: 0,
      });
      mock.calls.length = 0;
      await store.delete('my-key');
      const deleteManifestCall = mock.calls.find(
        c => c.args.includes('store') && c.args.includes('__frankenbeast_keys__'),
      );
      expect(deleteManifestCall).toBeDefined();
      expect(JSON.parse(deleteManifestCall!.stdin!)).toEqual([]);
    });
  });

  describe('darwin platform', () => {
    let mock: ReturnType<typeof createMockRunner>;
    let store: OsKeychainStore;

    beforeEach(() => {
      mock = createMockRunner();
      store = new OsKeychainStore({ runner: mock.runner, stdinRunner: mock.stdinRunner, platform: 'darwin' });
    });

    it('does not advertise macOS Keychain as write-capable', async () => {
      mock.responses.set('help', { stdout: '', stderr: 'Usage:', exitCode: 0 });
      const detection = await store.detect();
      expect(detection.available).toBe(false);
      expect(detection.reason).toContain('writes are disabled');
    });

    it('fails closed instead of exposing macOS Keychain values in argv', async () => {
      await expect(store.store('key', TEST_SLACK_BOT_TOKEN)).rejects.toThrow('macOS Keychain writes are disabled');
      expectNoArgContains(mock.calls, TEST_SLACK_BOT_TOKEN);
      expect(mock.calls.some(c => c.args.includes('add-generic-password'))).toBe(false);
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
      store = new OsKeychainStore({ runner: mock.runner, stdinRunner: mock.stdinRunner, platform: 'win32' });
    });

    it('does not advertise Windows Credential Manager as write-capable', async () => {
      mock.responses.set('cmdkey', { stdout: 'Currently stored credentials', stderr: '', exitCode: 0 });
      const detection = await store.detect();
      expect(detection.available).toBe(false);
      expect(detection.reason).toContain('writes are disabled');
    });

    it('fails closed instead of exposing cmdkey passwords in argv', async () => {
      await expect(store.store('key', TEST_SLACK_BOT_TOKEN)).rejects.toThrow('Windows Credential Manager writes are disabled');
      expectNoArgContains(mock.calls, TEST_SLACK_BOT_TOKEN);
      expect(mock.calls.some(c => c.command === 'cmdkey' && c.args.some(arg => arg.startsWith('/pass:')))).toBe(false);
    });

    it('escapes apostrophes in PowerShell credential targets when resolving', async () => {
      mock.responses.set('Get-StoredCredential', { stdout: 'resolved-value\r\n', stderr: '', exitCode: 0 });

      const value = await store.resolve("team's/token");

      expect(value).toBe('resolved-value');
      const resolveCall = mock.calls.find(c => c.command === 'powershell');
      expect(resolveCall).toBeDefined();
      expect(resolveCall!.args).toContain(
        "$cred = Get-StoredCredential -Target 'frankenbeast/team''s/token'; if ($cred) { $cred.GetNetworkCredential().Password }",
      );
    });

    it('keeps shell metacharacters inside the quoted PowerShell credential target', async () => {
      mock.responses.set('Get-StoredCredential', { stdout: 'resolved-value\r\n', stderr: '', exitCode: 0 });

      await store.resolve("prod'; Start-Process calc; 'token");

      const resolveCall = mock.calls.find(c => c.command === 'powershell');
      expect(resolveCall).toBeDefined();
      expect(resolveCall!.args[0]).toBe('-NoProfile');
      expect(resolveCall!.args[1]).toBe('-Command');
      expect(resolveCall!.args[2]).toBe(
        "$cred = Get-StoredCredential -Target 'frankenbeast/prod''; Start-Process calc; ''token'; if ($cred) { $cred.GetNetworkCredential().Password }",
      );
      expect(resolveCall!.args[2]).not.toContain("frankenbeast/prod'; Start-Process calc; 'token");
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
