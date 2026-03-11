import type { CliResult } from './cli-runner.js';
import type { ISecretStore, SecretStoreDetection } from '../secret-store.js';

type CliRunner = (command: string, args: string[]) => Promise<CliResult>;
type StdinRunner = (command: string, args: string[], stdin: string) => Promise<CliResult>;

const SERVICE = 'frankenbeast';
const KEYS_META_KEY = '__frankenbeast_keys__';

export interface OsKeychainStoreOptions {
  runner: CliRunner;
  stdinRunner?: StdinRunner;
  platform?: NodeJS.Platform | string;
}

export class OsKeychainStore implements ISecretStore {
  readonly id = 'os-keychain';

  private readonly runner: CliRunner;
  private readonly stdinRunner?: StdinRunner;
  private readonly platform: string;

  constructor(options: OsKeychainStoreOptions) {
    this.runner = options.runner;
    this.stdinRunner = options.stdinRunner;
    this.platform = options.platform ?? process.platform;
  }

  async detect(): Promise<SecretStoreDetection> {
    switch (this.platform) {
      case 'linux':
        return this.detectLinux();
      case 'darwin':
        return this.detectDarwin();
      case 'win32':
        return this.detectWin32();
      default:
        return {
          available: false,
          reason: `Unsupported platform: ${this.platform}`,
          setupInstructions: 'OS keychain is not supported on this platform.',
        };
    }
  }

  async store(key: string, value: string): Promise<void> {
    switch (this.platform) {
      case 'linux':
        return this.storeLinux(key, value);
      case 'darwin':
        return this.storeDarwin(key, value);
      case 'win32':
        return this.storeWin32(key, value);
      default:
        throw new Error(`OS keychain store not supported on platform: ${this.platform}`);
    }
  }

  async resolve(key: string): Promise<string | undefined> {
    switch (this.platform) {
      case 'linux':
        return this.resolveLinux(key);
      case 'darwin':
        return this.resolveDarwin(key);
      case 'win32':
        return this.resolveWin32(key);
      default:
        throw new Error(`OS keychain resolve not supported on platform: ${this.platform}`);
    }
  }

  async delete(key: string): Promise<void> {
    switch (this.platform) {
      case 'linux':
        return this.deleteLinux(key);
      case 'darwin':
        return this.deleteDarwin(key);
      case 'win32':
        return this.deleteWin32(key);
      default:
        throw new Error(`OS keychain delete not supported on platform: ${this.platform}`);
    }
  }

  async keys(): Promise<string[]> {
    switch (this.platform) {
      case 'linux':
        return this.keysLinux();
      case 'darwin':
        return this.keysDarwin();
      case 'win32':
        return this.keysWin32();
      default:
        return [];
    }
  }

  // ── Linux (secret-tool / GNOME Keyring) ─────────────────────────────────────

  private async detectLinux(): Promise<SecretStoreDetection> {
    const result = await this.runner('secret-tool', ['--version']);
    if (result.exitCode === 0) {
      return { available: true };
    }
    return {
      available: false,
      reason: 'secret-tool not found',
      setupInstructions:
        'Install secret-tool (GNOME Keyring): sudo apt install libsecret-tools',
    };
  }

  private async storeLinux(key: string, value: string): Promise<void> {
    // secret-tool store reads the secret from stdin
    const args = [
      'store',
      '--label=frankenbeast',
      'application',
      SERVICE,
      'key',
      key,
    ];
    if (this.stdinRunner) {
      await this.stdinRunner('secret-tool', args, value);
    } else {
      // Fallback: pass value as trailing arg (for mock runner compatibility in tests)
      await this.runner('secret-tool', [...args, value]);
    }
  }

  private async resolveLinux(key: string): Promise<string | undefined> {
    const result = await this.runner('secret-tool', [
      'lookup',
      'application',
      SERVICE,
      'key',
      key,
    ]);
    if (result.exitCode !== 0) {
      return undefined;
    }
    return result.stdout.replace(/\n$/, '');
  }

  private async deleteLinux(key: string): Promise<void> {
    await this.runner('secret-tool', [
      'clear',
      'application',
      SERVICE,
      'key',
      key,
    ]);
  }

  private async keysLinux(): Promise<string[]> {
    // secret-tool doesn't natively list keys; resolve the manifest key
    const value = await this.resolveLinux(KEYS_META_KEY);
    if (!value) return [];
    try {
      return JSON.parse(value) as string[];
    } catch {
      return [];
    }
  }

  // ── macOS (security / Keychain) ──────────────────────────────────────────────

  private async detectDarwin(): Promise<SecretStoreDetection> {
    const result = await this.runner('security', ['help']);
    // security help exits 0 on macOS; stderr may contain usage info
    if (result.exitCode === 0 || result.stderr.length > 0) {
      return { available: true };
    }
    return {
      available: false,
      reason: 'security command not found',
      setupInstructions: 'The security command is built into macOS and should always be available.',
    };
  }

  private async storeDarwin(key: string, value: string): Promise<void> {
    await this.runner('security', [
      'add-generic-password',
      '-U',
      '-s', SERVICE,
      '-a', key,
      '-w', value,
    ]);
  }

  private async resolveDarwin(key: string): Promise<string | undefined> {
    const result = await this.runner('security', [
      'find-generic-password',
      '-s', SERVICE,
      '-a', key,
      '-w',
    ]);
    if (result.exitCode !== 0) {
      return undefined;
    }
    return result.stdout.replace(/\n$/, '');
  }

  private async deleteDarwin(key: string): Promise<void> {
    await this.runner('security', [
      'delete-generic-password',
      '-s', SERVICE,
      '-a', key,
    ]);
  }

  private async keysDarwin(): Promise<string[]> {
    // Resolve from a metadata key we maintain
    const value = await this.resolveDarwin(KEYS_META_KEY);
    if (!value) return [];
    try {
      return JSON.parse(value) as string[];
    } catch {
      return [];
    }
  }

  // ── Windows (cmdkey / Credential Manager) ───────────────────────────────────

  private async detectWin32(): Promise<SecretStoreDetection> {
    const result = await this.runner('cmdkey', ['/list']);
    if (result.exitCode === 0) {
      return { available: true };
    }
    return {
      available: false,
      reason: 'cmdkey not found',
      setupInstructions: 'cmdkey is a built-in Windows utility and should always be available.',
    };
  }

  private async storeWin32(key: string, value: string): Promise<void> {
    await this.runner('cmdkey', [
      `/generic:${SERVICE}/${key}`,
      `/user:${SERVICE}`,
      `/pass:${value}`,
    ]);
  }

  private async resolveWin32(key: string): Promise<string | undefined> {
    // cmdkey /list does not display passwords; use PowerShell to retrieve
    const target = `${SERVICE}/${key}`;
    const result = await this.runner('powershell', [
      '-NoProfile',
      '-Command',
      `$cred = Get-StoredCredential -Target '${target}'; if ($cred) { $cred.GetNetworkCredential().Password }`,
    ]);
    if (result.exitCode !== 0 || !result.stdout.trim()) {
      return undefined;
    }
    return result.stdout.replace(/\r?\n$/, '');
  }

  private async deleteWin32(key: string): Promise<void> {
    await this.runner('cmdkey', [`/delete:${SERVICE}/${key}`]);
  }

  private async keysWin32(): Promise<string[]> {
    const result = await this.runner('cmdkey', ['/list']);
    if (result.exitCode !== 0) return [];
    const prefix = `${SERVICE}/`;
    const lines = result.stdout.split(/\r?\n/);
    return lines
      .filter(line => line.includes(prefix))
      .map(line => {
        const match = line.match(new RegExp(`${SERVICE}/(.+?)(?:\\s|$)`));
        return match ? match[1] : null;
      })
      .filter((k): k is string => k !== null && k !== KEYS_META_KEY);
  }
}
