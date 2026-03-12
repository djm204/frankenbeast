# Secret Store Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all 4 secret backends (`local-encrypted`, `1password`, `bitwarden`, `os-keychain`) fully functional with store/resolve/delete/keys, wire them into the init wizard and runtime boot sequence, and document everything.

**Architecture:** An `ISecretStore` interface with 4 implementations behind a factory. The init wizard detects available backends, prompts for raw secret values, and stores them via the selected backend. At runtime, a `SecretResolver` resolves logical keys to plaintext in the supervisor process and passes values to child services via dependency injection. Config stores only logical key strings; `network.secureBackend` determines which backend handles all secrets.

**Tech Stack:** Node.js crypto (AES-256-GCM, PBKDF2), child_process.execFile for CLI wrappers (op, bw, secret-tool, security, cmdkey), Zod schemas, Vitest

**Spec:** `docs/plans/2026-03-11-secret-store-design.md`

**Dependency:** `docs/plans/2026-03-11-agent-init-workflow-implementation-plan.md` is currently being implemented on the same branch. That plan adds tracked-agent routes, agent services, and dashboard catalog changes. The following files are modified by BOTH plans and MUST be read fresh before editing (do NOT assume the contents shown in this plan are current):

| Shared File | Agent-Init Adds | Secret-Store Adds |
|---|---|---|
| `src/http/routes/beast-routes.ts` | Agent route mounting | No change (operator token auth already exists) |
| `src/http/chat-app.ts` | Agent route mounting | No change |
| `src/beasts/create-beast-services.ts` | Agent service wiring | No change |
| `src/cli/run.ts` | No change | `resolveBeastOperatorToken()` reads from secret store |
| `docs/ARCHITECTURE.md` | Agent init lifecycle section | Secret store section (append, don't replace) |
| `docs/RAMP_UP.md` | Agent init section | Secret store section (append, don't replace) |
| `packages/franken-web/README.md` | Catalog picker docs | Operator token setup section (append) |

**Rule:** For any file in this table, always `Read` the current file contents before editing. Never use code snippets from this plan as the baseline — they may be stale. Apply changes additively (append sections, don't overwrite).

---

## File Structure

All paths relative to `packages/franken-orchestrator/`.

### New Files
| File | Responsibility |
|---|---|
| `src/network/secret-store.ts` | `ISecretStore` interface, `SecretStoreDetection` type, `SecretStoreFactory`, `SecretResolver` class |
| `src/network/secret-backends/local-encrypted-store.ts` | REWRITE: `LocalEncryptedStore` implementing `ISecretStore` with AES-256-GCM |
| `src/network/secret-backends/one-password-store.ts` | `OnePasswordStore` implementing `ISecretStore` via `op` CLI |
| `src/network/secret-backends/bitwarden-store.ts` | `BitwardenStore` implementing `ISecretStore` via `bw` CLI |
| `src/network/secret-backends/os-keychain-store.ts` | `OsKeychainStore` implementing `ISecretStore` with platform detection |
| `src/network/secret-backends/cli-runner.ts` | Shared `runCli(command, args)` helper for exec backends |
| `tests/unit/network/secret-store.test.ts` | Tests for `SecretStoreFactory` and `SecretResolver` |
| `tests/unit/network/secret-backends/local-encrypted-store.test.ts` | Tests for `LocalEncryptedStore` |
| `tests/unit/network/secret-backends/one-password-store.test.ts` | Tests for `OnePasswordStore` |
| `tests/unit/network/secret-backends/bitwarden-store.test.ts` | Tests for `BitwardenStore` |
| `tests/unit/network/secret-backends/os-keychain-store.test.ts` | Tests for `OsKeychainStore` |
| `tests/unit/network/secret-backends/cli-runner.test.ts` | Tests for shared CLI runner |
| `docs/adr/018-secret-store-architecture.md` | ADR for the ISecretStore architecture |
| `docs/adr/019-secret-backend-comparison.md` | ADR for backend trade-offs and recommendation |
| `frankenbeast.example.json` | Complete example config file |

### Modified Files
| File | Change |
|---|---|
| `src/network/network-config.ts` | Add `operatorTokenRef` to `NetworkOperatorConfigSchema`, consolidate `SecureBackendSchema` to `os-keychain` with `.preprocess()` migration |
| `src/network/network-config-paths.ts` | Add `network.operatorTokenRef` path def (sensitive), update `network.secureBackend` enum values |
| `src/network/network-secrets.ts` | Add `network.operatorTokenRef` to `SENSITIVE_CONFIG_PATHS`, update `detectAvailableSecretBackends` to use `ISecretStore.detect()`, remove superseded `createSecretRef()` |
| `src/init/init-types.ts` | Add `'secret-backend-selection'` to `InitStepId` |
| `src/init/init-wizard.ts` | Add `'secret-backend'` to `InitWizardScope`, backend selection step, raw value prompts, operator token generation |
| `src/init/init-engine.ts` | Pass secret store to wizard, accept `ISecretStore` in options |
| `src/init/init-verify.ts` | Add `'secret-backend-unavailable'` issue code, verify secrets resolve |
| `src/cli/run.ts` | Update `resolveBeastOperatorToken()` to try secret store first |
| `src/cli/init-command.ts` | Create secret store and pass to init engine |
| `tests/unit/network/secret-backends.test.ts` | Update for new backend IDs |
| `tests/unit/network/network-secrets.test.ts` | Update for `operatorTokenRef`, remove `createSecretRef` test |
| `tests/unit/init/init-wizard.test.ts` | Add tests for new wizard steps |
| `README.md` (root) | Add Secret Management section |
| `packages/franken-web/README.md` | Add operator token setup instructions |

### Deleted Files (intentional renames — not rewrite-in-place)

The spec describes these as "rewrites" but this plan intentionally creates new files with `-store` suffix and deletes the old stubs. Rationale: the old files are 5-line catalog objects with no implementation — a rewrite-in-place would produce a confusing git diff. New files give a clean history showing the full `ISecretStore` implementation as a new addition.

| File | Reason |
|---|---|
| `src/network/secret-backends/one-password.ts` | Replaced by `one-password-store.ts` (new file, clean git history) |
| `src/network/secret-backends/bitwarden.ts` | Replaced by `bitwarden-store.ts` (new file, clean git history) |
| `src/network/secret-backends/os-store.ts` | Replaced by `os-keychain-store.ts` (new file, clean git history) |

---

## Chunk 1: ISecretStore Interface, Factory, and CLI Runner

### Task 1: Write the ISecretStore interface and types

**Files:**
- Create: `src/network/secret-store.ts`

- [ ] **Step 1: Write the failing test for SecretStoreFactory**

Create `tests/unit/network/secret-store.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createSecretStore } from '../../../src/network/secret-store.js';

describe('SecretStoreFactory', () => {
  it('creates a local-encrypted store', () => {
    const store = createSecretStore('local-encrypted', {
      projectRoot: '/tmp/test-project',
    });
    expect(store.id).toBe('local-encrypted');
  });

  it('creates a 1password store', () => {
    const store = createSecretStore('1password', {
      projectRoot: '/tmp/test-project',
    });
    expect(store.id).toBe('1password');
  });

  it('creates a bitwarden store', () => {
    const store = createSecretStore('bitwarden', {
      projectRoot: '/tmp/test-project',
    });
    expect(store.id).toBe('bitwarden');
  });

  it('creates an os-keychain store', () => {
    const store = createSecretStore('os-keychain', {
      projectRoot: '/tmp/test-project',
    });
    expect(store.id).toBe('os-keychain');
  });

  it('throws for unknown backend', () => {
    expect(() => createSecretStore('unknown' as any, {
      projectRoot: '/tmp/test-project',
    })).toThrow('Unknown secret backend: unknown');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/network/secret-store.test.ts`
Expected: FAIL — `secret-store.ts` does not export `createSecretStore`

- [ ] **Step 3: Write the ISecretStore interface and factory**

Create `src/network/secret-store.ts`:

```ts
import type { InterviewIO } from '../planning/interview-loop.js';

export interface SecretStoreDetection {
  available: boolean;
  reason?: string;
  setupInstructions?: string;
}

export interface ISecretStore {
  readonly id: string;
  detect(): Promise<SecretStoreDetection>;
  /** Upsert: creates if new, updates if exists. */
  store(key: string, value: string): Promise<void>;
  resolve(key: string): Promise<string | undefined>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

export interface SecretStoreOptions {
  projectRoot: string;
  io?: InterviewIO;
  passphrase?: string;
}

export function createSecretStore(
  backendId: string,
  options: SecretStoreOptions,
): ISecretStore {
  switch (backendId) {
    case 'local-encrypted':
      return createLocalEncryptedStore(options);
    case '1password':
      return createOnePasswordStore();
    case 'bitwarden':
      return createBitwardenStore();
    case 'os-keychain':
      return createOsKeychainStore();
    default:
      throw new Error(`Unknown secret backend: ${backendId}`);
  }
}

// Placeholder factory functions — replaced in subsequent tasks
function createLocalEncryptedStore(options: SecretStoreOptions): ISecretStore {
  return createStubStore('local-encrypted');
}

function createOnePasswordStore(): ISecretStore {
  return createStubStore('1password');
}

function createBitwardenStore(): ISecretStore {
  return createStubStore('bitwarden');
}

function createOsKeychainStore(): ISecretStore {
  return createStubStore('os-keychain');
}

function createStubStore(id: string): ISecretStore {
  return {
    id,
    detect: async () => ({ available: false, reason: 'Not yet implemented' }),
    store: async () => { throw new Error(`${id} store not yet implemented`); },
    resolve: async () => { throw new Error(`${id} resolve not yet implemented`); },
    delete: async () => { throw new Error(`${id} delete not yet implemented`); },
    keys: async () => { throw new Error(`${id} keys not yet implemented`); },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/network/secret-store.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/network/secret-store.ts packages/franken-orchestrator/tests/unit/network/secret-store.test.ts
git commit -m "feat(secret-store): add ISecretStore interface and factory with stubs"
```

### Task 2: Shared CLI runner utility

**Files:**
- Create: `src/network/secret-backends/cli-runner.ts`
- Create: `tests/unit/network/secret-backends/cli-runner.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { runCli, commandExists } from '../../../../src/network/secret-backends/cli-runner.js';

describe('cli-runner', () => {
  describe('commandExists', () => {
    it('returns true when command is found', async () => {
      // 'node' should always be available in test env
      const result = await commandExists('node');
      expect(result).toBe(true);
    });

    it('returns false when command is not found', async () => {
      const result = await commandExists('nonexistent-command-abc123');
      expect(result).toBe(false);
    });
  });

  describe('runCli', () => {
    it('returns stdout from successful command', async () => {
      const result = await runCli('node', ['--version']);
      expect(result.stdout).toMatch(/^v\d+/);
      expect(result.exitCode).toBe(0);
    });

    it('returns error for failed command', async () => {
      const result = await runCli('node', ['-e', 'process.exit(1)']);
      expect(result.exitCode).toBe(1);
    });

    it('throws on command not found', async () => {
      await expect(runCli('nonexistent-command-abc123', [])).rejects.toThrow();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/network/secret-backends/cli-runner.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the CLI runner**

Create `src/network/secret-backends/cli-runner.ts`:

```ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { which } from '../../../vendor/which.js'; // or use process-based detection

const execFileAsync = promisify(execFile);

export interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function runCli(
  command: string,
  args: string[],
  options?: { stdin?: string; env?: Record<string, string> },
): Promise<CliResult> {
  try {
    const result = await execFileAsync(command, args, {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
      env: options?.env ? { ...process.env, ...options.env } : undefined,
      ...(options?.stdin !== undefined ? {} : {}),
    });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: 0,
    };
  } catch (error: unknown) {
    const execError = error as { stdout?: string; stderr?: string; code?: number | string };
    if (typeof execError.code === 'number') {
      return {
        stdout: execError.stdout ?? '',
        stderr: execError.stderr ?? '',
        exitCode: execError.code,
      };
    }
    throw error;
  }
}

export async function commandExists(command: string): Promise<boolean> {
  try {
    // Use 'which' on Unix, 'where' on Windows
    const whichCmd = process.platform === 'win32' ? 'where' : 'which';
    const result = await runCli(whichCmd, [command]);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

export async function runCliWithStdin(
  command: string,
  args: string[],
  stdin: string,
  env?: Record<string, string>,
): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = execFile(command, args, {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
      env: env ? { ...process.env, ...env } : undefined,
    }, (error, stdout, stderr) => {
      if (error && typeof (error as any).code !== 'number') {
        reject(error);
        return;
      }
      resolve({
        stdout: stdout ?? '',
        stderr: stderr ?? '',
        exitCode: (error as any)?.code ?? 0,
      });
    });
    child.stdin?.write(stdin);
    child.stdin?.end();
  });
}
```

Note: The exact implementation will need adjustment based on available utilities in the codebase. Check if there's already a `which`-like utility or use the `which` command via execFile.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/network/secret-backends/cli-runner.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/network/secret-backends/cli-runner.ts packages/franken-orchestrator/tests/unit/network/secret-backends/cli-runner.test.ts
git commit -m "feat(secret-store): add shared CLI runner utility for secret backends"
```

---

## Chunk 2: LocalEncryptedStore

### Task 3a: Verify .gitignore coverage for secret files (SECURITY PREREQUISITE)

**Files:**
- Verify: `.gitignore` (root)

The root `.gitignore` already has `.frankenbeast/` which covers `secrets.enc` and `secrets.meta.json`. Verify this before writing any secret files to disk.

- [ ] **Step 1: Verify .gitignore covers secret files**

Run: `grep -n '.frankenbeast' .gitignore`
Expected: `.frankenbeast/` is listed. If NOT present, add it immediately:

```bash
echo '.frankenbeast/' >> .gitignore
git add .gitignore && git commit -m "chore: ensure .frankenbeast/ is gitignored (security: secret files)"
```

If the pattern already covers the directory (confirmed: it does — line 8 of root `.gitignore`), no action needed. Proceed to Task 3.

### Task 3: Implement LocalEncryptedStore

**Files:**
- Rewrite: `src/network/secret-backends/local-encrypted-store.ts`
- Create: `tests/unit/network/secret-backends/local-encrypted-store.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LocalEncryptedStore } from '../../../../src/network/secret-backends/local-encrypted-store.js';

describe('LocalEncryptedStore', () => {
  let tempDir: string;
  let store: LocalEncryptedStore;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'secret-test-'));
    store = new LocalEncryptedStore({
      projectRoot: tempDir,
      passphrase: 'test-passphrase-1234',
    });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('detect', () => {
    it('always reports available', async () => {
      const detection = await store.detect();
      expect(detection.available).toBe(true);
    });
  });

  describe('store and resolve', () => {
    it('stores and resolves a secret', async () => {
      await store.store('comms.slack.botTokenRef', 'xoxb-test-token');
      const value = await store.resolve('comms.slack.botTokenRef');
      expect(value).toBe('xoxb-test-token');
    });

    it('returns undefined for non-existent key', async () => {
      const value = await store.resolve('nonexistent.key');
      expect(value).toBeUndefined();
    });

    it('upserts existing key', async () => {
      await store.store('key', 'value1');
      await store.store('key', 'value2');
      const value = await store.resolve('key');
      expect(value).toBe('value2');
    });

    it('handles multiple secrets', async () => {
      await store.store('key1', 'value1');
      await store.store('key2', 'value2');
      expect(await store.resolve('key1')).toBe('value1');
      expect(await store.resolve('key2')).toBe('value2');
    });
  });

  describe('delete', () => {
    it('deletes a stored secret', async () => {
      await store.store('key', 'value');
      await store.delete('key');
      const value = await store.resolve('key');
      expect(value).toBeUndefined();
    });

    it('is a no-op for non-existent key', async () => {
      await expect(store.delete('nonexistent')).resolves.not.toThrow();
    });
  });

  describe('keys', () => {
    it('lists all stored keys', async () => {
      await store.store('key1', 'value1');
      await store.store('key2', 'value2');
      const allKeys = await store.keys();
      expect(allKeys).toEqual(expect.arrayContaining(['key1', 'key2']));
      expect(allKeys).toHaveLength(2);
    });

    it('returns empty array when no secrets stored', async () => {
      const allKeys = await store.keys();
      expect(allKeys).toEqual([]);
    });
  });

  describe('encryption', () => {
    it('persists secrets encrypted on disk', async () => {
      await store.store('key', 'sensitive-value');
      const { readFile } = await import('node:fs/promises');
      const encPath = join(tempDir, '.frankenbeast', 'secrets.enc');
      const raw = await readFile(encPath, 'utf-8');
      expect(raw).not.toContain('sensitive-value');
    });

    it('cannot decrypt with wrong passphrase', async () => {
      await store.store('key', 'value');
      const wrongStore = new LocalEncryptedStore({
        projectRoot: tempDir,
        passphrase: 'wrong-passphrase',
      });
      await expect(wrongStore.resolve('key')).rejects.toThrow();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/network/secret-backends/local-encrypted-store.test.ts`
Expected: FAIL — `LocalEncryptedStore` class doesn't exist

- [ ] **Step 3: Implement LocalEncryptedStore**

Rewrite `src/network/secret-backends/local-encrypted-store.ts`:

```ts
import { randomBytes, createCipheriv, createDecipheriv, pbkdf2Sync } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ISecretStore, SecretStoreDetection, SecretStoreOptions } from '../secret-store.js';

const ALGORITHM = 'aes-256-gcm';
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_DIGEST = 'sha512';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;

interface SecretsMeta {
  salt: string; // hex
  version: 1;
}

export class LocalEncryptedStore implements ISecretStore {
  readonly id = 'local-encrypted';
  private readonly projectRoot: string;
  private readonly passphrase: string;
  private derivedKey: Buffer | undefined;

  constructor(options: SecretStoreOptions & { passphrase: string }) {
    this.projectRoot = options.projectRoot;
    this.passphrase = options.passphrase;
  }

  async detect(): Promise<SecretStoreDetection> {
    return { available: true };
  }

  async store(key: string, value: string): Promise<void> {
    const secrets = await this.loadSecrets();
    secrets[key] = value;
    await this.saveSecrets(secrets);
  }

  async resolve(key: string): Promise<string | undefined> {
    const secrets = await this.loadSecrets();
    return secrets[key];
  }

  async delete(key: string): Promise<void> {
    const secrets = await this.loadSecrets();
    delete secrets[key];
    await this.saveSecrets(secrets);
  }

  async keys(): Promise<string[]> {
    const secrets = await this.loadSecrets();
    return Object.keys(secrets);
  }

  private get secretsDir(): string {
    return join(this.projectRoot, '.frankenbeast');
  }

  private get encPath(): string {
    return join(this.secretsDir, 'secrets.enc');
  }

  private get metaPath(): string {
    return join(this.secretsDir, 'secrets.meta.json');
  }

  private async ensureDir(): Promise<void> {
    await mkdir(this.secretsDir, { recursive: true });
  }

  private async getDerivedKey(): Promise<Buffer> {
    if (this.derivedKey) {
      return this.derivedKey;
    }

    let meta: SecretsMeta;
    try {
      const raw = await readFile(this.metaPath, 'utf-8');
      meta = JSON.parse(raw) as SecretsMeta;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // First use — generate salt
        const salt = randomBytes(SALT_LENGTH).toString('hex');
        meta = { salt, version: 1 };
        await this.ensureDir();
        await writeFile(this.metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf-8');
      } else {
        throw error;
      }
    }

    this.derivedKey = pbkdf2Sync(
      this.passphrase,
      Buffer.from(meta.salt, 'hex'),
      PBKDF2_ITERATIONS,
      KEY_LENGTH,
      PBKDF2_DIGEST,
    );
    return this.derivedKey;
  }

  private async loadSecrets(): Promise<Record<string, string>> {
    let ciphertext: Buffer;
    try {
      ciphertext = await readFile(this.encPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {};
      }
      throw error;
    }

    const key = await this.getDerivedKey();
    const iv = ciphertext.subarray(0, IV_LENGTH);
    const authTag = ciphertext.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = ciphertext.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(decrypted.toString('utf-8')) as Record<string, string>;
  }

  private async saveSecrets(secrets: Record<string, string>): Promise<void> {
    await this.ensureDir();
    const key = await this.getDerivedKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const plaintext = Buffer.from(JSON.stringify(secrets), 'utf-8');
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const combined = Buffer.concat([iv, authTag, encrypted]);
    await writeFile(this.encPath, combined);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/network/secret-backends/local-encrypted-store.test.ts`
Expected: PASS

- [ ] **Step 5: Wire LocalEncryptedStore into factory**

Update `src/network/secret-store.ts` — replace `createLocalEncryptedStore` stub:

```ts
import { LocalEncryptedStore } from './secret-backends/local-encrypted-store.js';

function createLocalEncryptedStore(options: SecretStoreOptions): ISecretStore {
  const passphrase = options.passphrase ?? process.env.FRANKENBEAST_PASSPHRASE;
  if (!passphrase) {
    throw new Error(
      'Local encrypted store requires a passphrase. Set FRANKENBEAST_PASSPHRASE env var or pass via options.',
    );
  }
  return new LocalEncryptedStore({ ...options, passphrase });
}
```

- [ ] **Step 6: Run all secret-store tests**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/network/secret-store.test.ts tests/unit/network/secret-backends/local-encrypted-store.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/franken-orchestrator/src/network/secret-backends/local-encrypted-store.ts packages/franken-orchestrator/src/network/secret-store.ts packages/franken-orchestrator/tests/unit/network/secret-backends/local-encrypted-store.test.ts
git commit -m "feat(secret-store): implement LocalEncryptedStore with AES-256-GCM"
```

---

## Chunk 3: OnePasswordStore and BitwardenStore

### Task 4: Implement OnePasswordStore

**Files:**
- Create: `src/network/secret-backends/one-password-store.ts`
- Create: `tests/unit/network/secret-backends/one-password-store.test.ts`
- Delete: `src/network/secret-backends/one-password.ts`

- [ ] **Step 1: Write the failing tests**

Tests use a mock CLI runner to avoid requiring `op` in the test environment:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
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
      // get returns not found
      mock.responses.set('item get', { stdout: '', stderr: 'not found', exitCode: 1 });
      // create succeeds
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/network/secret-backends/one-password-store.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement OnePasswordStore**

Create `src/network/secret-backends/one-password-store.ts`. Implementation wraps `op` CLI commands with upsert logic: attempt `op item get` first, then either `op item edit` or `op item create`. Accept a `CliRunner` function type for testability (production uses `runCli` from `cli-runner.ts`).

Key implementation details:
- `store()`: upsert via get-then-create-or-edit
- `resolve()`: `op read "op://frankenbeast/frankenbeast%2F<key>/password"` — URL-encode the `/` in key names
- `detect()`: try `op --version`, return setup instructions if unavailable
- `keys()`: `op item list --vault=frankenbeast --format=json` → filter titles starting with `frankenbeast/`

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/network/secret-backends/one-password-store.test.ts`
Expected: PASS

- [ ] **Step 5: Delete old file, wire into factory**

```bash
rm packages/franken-orchestrator/src/network/secret-backends/one-password.ts
```

Update `src/network/secret-store.ts`:
```ts
import { OnePasswordStore } from './secret-backends/one-password-store.js';
import { runCli } from './secret-backends/cli-runner.js';

function createOnePasswordStore(): ISecretStore {
  return new OnePasswordStore(runCli);
}
```

- [ ] **Step 6: Commit**

```bash
git add -A packages/franken-orchestrator/src/network/secret-backends/ packages/franken-orchestrator/src/network/secret-store.ts packages/franken-orchestrator/tests/unit/network/secret-backends/one-password-store.test.ts
git commit -m "feat(secret-store): implement OnePasswordStore with upsert and mock CLI runner"
```

### Task 5: Implement BitwardenStore

**Files:**
- Create: `src/network/secret-backends/bitwarden-store.ts`
- Create: `tests/unit/network/secret-backends/bitwarden-store.test.ts`
- Delete: `src/network/secret-backends/bitwarden.ts`

- [ ] **Step 1: Write the failing tests**

Same pattern as OnePasswordStore — mock CLI runner, test detect/store/resolve/delete/keys. Key differences:
- `store()`: `bw create item` via stdin JSON payload, upsert via `bw get item` then `bw edit item <uuid>`
- Session token management: `BW_SESSION` env var passed to all commands
- `detect()`: try `bw --version`

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/network/secret-backends/bitwarden-store.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement BitwardenStore**

Create `src/network/secret-backends/bitwarden-store.ts`. Similar structure to OnePasswordStore but using `bw` CLI commands. Upsert via get-then-create-or-edit. Uses `runCliWithStdin` for `bw create item`. Store session token from `BW_SESSION` env var.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/network/secret-backends/bitwarden-store.test.ts`
Expected: PASS

- [ ] **Step 5: Delete old file, wire into factory**

```bash
rm packages/franken-orchestrator/src/network/secret-backends/bitwarden.ts
```

Update factory in `src/network/secret-store.ts`.

- [ ] **Step 6: Commit**

```bash
git add -A packages/franken-orchestrator/src/network/secret-backends/ packages/franken-orchestrator/src/network/secret-store.ts packages/franken-orchestrator/tests/unit/network/secret-backends/bitwarden-store.test.ts
git commit -m "feat(secret-store): implement BitwardenStore with upsert and session management"
```

---

## Chunk 4: OsKeychainStore

### Task 6: Implement OsKeychainStore

**Files:**
- Create: `src/network/secret-backends/os-keychain-store.ts`
- Create: `tests/unit/network/secret-backends/os-keychain-store.test.ts`
- Delete: `src/network/secret-backends/os-store.ts`

- [ ] **Step 1: Write the failing tests**

Tests use a mock CLI runner. Test each platform path (linux, darwin, win32) by passing platform string to constructor:

```ts
describe('OsKeychainStore', () => {
  describe('linux platform', () => {
    it('detects via secret-tool availability', async () => { /* ... */ });
    it('stores via secret-tool store', async () => { /* ... */ });
    it('resolves via secret-tool lookup', async () => { /* ... */ });
    it('reports WSL2 warning when /proc/version contains microsoft', async () => { /* ... */ });
    it('provides setup instructions when secret-tool missing', async () => { /* ... */ });
  });

  describe('darwin platform', () => {
    it('detects via security command', async () => { /* ... */ });
    it('stores via security add-generic-password -U', async () => { /* ... */ });
    it('resolves via security find-generic-password -w', async () => { /* ... */ });
  });

  describe('win32 platform', () => {
    it('detects via cmdkey', async () => { /* ... */ });
    it('stores via cmdkey /generic', async () => { /* ... */ });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/network/secret-backends/os-keychain-store.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement OsKeychainStore**

Create `src/network/secret-backends/os-keychain-store.ts`. Constructor accepts `platform` string (defaults to `process.platform`). Internal `PlatformAdapter` interface dispatches to the right CLI commands per platform. WSL2 detection reads `/proc/version` for `microsoft` string.

Key implementation: `macOS` uses `security add-generic-password -U` (the `-U` flag handles upsert natively). Linux `secret-tool store` overwrites by default (upsert). Windows `cmdkey` with `/generic:` overwrites existing.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/network/secret-backends/os-keychain-store.test.ts`
Expected: PASS

- [ ] **Step 5: Delete old file, wire into factory**

```bash
rm packages/franken-orchestrator/src/network/secret-backends/os-store.ts
```

Update factory in `src/network/secret-store.ts`.

- [ ] **Step 6: Run all backend tests**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/network/secret-backends/`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add -A packages/franken-orchestrator/src/network/secret-backends/ packages/franken-orchestrator/src/network/secret-store.ts packages/franken-orchestrator/tests/unit/network/secret-backends/
git commit -m "feat(secret-store): implement OsKeychainStore with platform detection (linux/macOS/Windows)"
```

---

## Chunk 5: SecretResolver and Config Schema Changes

### Task 7: Implement SecretResolver

**Files:**
- Modify: `src/network/secret-store.ts` (add `SecretResolver` class)
- Create: `tests/unit/network/secret-resolver.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { SecretResolver } from '../../../src/network/secret-store.js';
import type { ISecretStore, SecretStoreDetection } from '../../../src/network/secret-store.js';
import { defaultConfig } from '../../../src/config/orchestrator-config.js';

function createInMemoryStore(secrets: Record<string, string>): ISecretStore {
  const data = new Map(Object.entries(secrets));
  return {
    id: 'test',
    detect: async (): Promise<SecretStoreDetection> => ({ available: true }),
    store: async (key, value) => { data.set(key, value); },
    resolve: async (key) => data.get(key),
    delete: async (key) => { data.delete(key); },
    keys: async () => [...data.keys()],
  };
}

describe('SecretResolver', () => {
  it('resolves a single secret', async () => {
    const store = createInMemoryStore({ 'comms.slack.botTokenRef': 'xoxb-test' });
    const resolver = new SecretResolver(store);
    const value = await resolver.resolve('comms.slack.botTokenRef');
    expect(value).toBe('xoxb-test');
  });

  it('returns undefined for missing optional secret', async () => {
    const store = createInMemoryStore({});
    const resolver = new SecretResolver(store);
    const value = await resolver.resolve('comms.slack.botTokenRef');
    expect(value).toBeUndefined();
  });

  it('resolves all secrets from config using config field values as lookup keys', async () => {
    // IMPORTANT: Use distinct key names (not matching the config path) to verify
    // the resolver reads config.*.botTokenRef (the value) not the field name.
    const store = createInMemoryStore({
      'my-operator-key': 'op-token',
      'my-slack-bot-key': 'xoxb-test',
      'my-slack-signing-key': 'signing-test',
    });
    const resolver = new SecretResolver(store);
    const config = defaultConfig();
    (config.network as any).operatorTokenRef = 'my-operator-key';
    config.comms.slack.enabled = true;
    config.comms.slack.botTokenRef = 'my-slack-bot-key';
    config.comms.slack.signingSecretRef = 'my-slack-signing-key';

    const resolved = await resolver.resolveAll(config);
    expect(resolved.operatorToken).toBe('op-token');
    expect(resolved.slackBotToken).toBe('xoxb-test');
    expect(resolved.slackSigningSecret).toBe('signing-test');
  });

  it('returns undefined for disabled transport secrets', async () => {
    const store = createInMemoryStore({});
    const resolver = new SecretResolver(store);
    const config = defaultConfig();
    // slack disabled by default
    const resolved = await resolver.resolveAll(config);
    expect(resolved.slackBotToken).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/network/secret-resolver.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement SecretResolver**

Add to `src/network/secret-store.ts`:

```ts
import type { OrchestratorConfig } from '../config/orchestrator-config.js';

export interface ResolvedSecrets {
  operatorToken?: string;
  orchestratorToken?: string;
  slackBotToken?: string;
  slackSigningSecret?: string;
  discordBotToken?: string;
}

export class SecretResolver {
  constructor(private readonly store: ISecretStore) {}

  async resolve(key: string): Promise<string | undefined> {
    return this.store.resolve(key);
  }

  async resolveAll(config: OrchestratorConfig): Promise<ResolvedSecrets> {
    // IMPORTANT: Read the config field VALUE as the lookup key, not the field name.
    // Config stores logical key strings (e.g., config.network.operatorTokenRef = 'my-key')
    // and that string is used to look up the secret in the backend.
    const operatorTokenKey = (config.network as Record<string, unknown>).operatorTokenRef as string | undefined;
    const operatorToken = operatorTokenKey
      ? await this.store.resolve(operatorTokenKey)
      : undefined;

    const orchestratorToken = config.comms.enabled && config.comms.orchestratorTokenRef
      ? await this.store.resolve(config.comms.orchestratorTokenRef)
      : undefined;

    const slackBotToken = config.comms.slack.enabled && config.comms.slack.botTokenRef
      ? await this.store.resolve(config.comms.slack.botTokenRef)
      : undefined;
    const slackSigningSecret = config.comms.slack.enabled && config.comms.slack.signingSecretRef
      ? await this.store.resolve(config.comms.slack.signingSecretRef)
      : undefined;

    const discordBotToken = config.comms.discord.enabled && config.comms.discord.botTokenRef
      ? await this.store.resolve(config.comms.discord.botTokenRef)
      : undefined;

    return {
      operatorToken,
      orchestratorToken,
      slackBotToken,
      slackSigningSecret,
      discordBotToken,
    };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/network/secret-resolver.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/network/secret-store.ts packages/franken-orchestrator/tests/unit/network/secret-resolver.test.ts
git commit -m "feat(secret-store): implement SecretResolver for runtime secret resolution"
```

### Task 8: Config schema changes

**Files:**
- Modify: `src/network/network-config.ts`
- Modify: `src/network/network-config-paths.ts`
- Modify: `src/network/network-secrets.ts`
- Modify: `tests/unit/network/secret-backends.test.ts`
- Modify: `tests/unit/network/network-secrets.test.ts`

- [ ] **Step 1: Write failing test for SecureBackendSchema migration**

Add to `tests/unit/network/network-secrets.test.ts`:

```ts
it('migrates legacy OS backend names to os-keychain', () => {
  const config1 = OrchestratorConfigSchema.parse({
    network: { secureBackend: 'macos-keychain' },
  });
  expect(config1.network.secureBackend).toBe('os-keychain');

  const config2 = OrchestratorConfigSchema.parse({
    network: { secureBackend: 'windows-credential-manager' },
  });
  expect(config2.network.secureBackend).toBe('os-keychain');

  const config3 = OrchestratorConfigSchema.parse({
    network: { secureBackend: 'linux-secret-service' },
  });
  expect(config3.network.secureBackend).toBe('os-keychain');
});

it('accepts the new os-keychain value directly', () => {
  const config = OrchestratorConfigSchema.parse({
    network: { secureBackend: 'os-keychain' },
  });
  expect(config.network.secureBackend).toBe('os-keychain');
});

it('includes operatorTokenRef in config', () => {
  const config = OrchestratorConfigSchema.parse({
    network: { operatorTokenRef: 'network.operatorTokenRef' },
  });
  expect(config.network.operatorTokenRef).toBe('network.operatorTokenRef');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/network/network-secrets.test.ts`
Expected: FAIL — `macos-keychain` no longer valid without preprocess, `operatorTokenRef` not in schema

- [ ] **Step 3: Update SecureBackendSchema with preprocess migration**

Modify `src/network/network-config.ts`:

```ts
const LEGACY_BACKEND_MAP: Record<string, string> = {
  'macos-keychain': 'os-keychain',
  'windows-credential-manager': 'os-keychain',
  'linux-secret-service': 'os-keychain',
};

export const SecureBackendSchema = z.preprocess(
  (val) => (typeof val === 'string' ? (LEGACY_BACKEND_MAP[val] ?? val) : val),
  z.enum(['1password', 'bitwarden', 'os-keychain', 'local-encrypted']),
);

export const NetworkOperatorConfigSchema = z.object({
  mode: NetworkModeSchema.default('secure'),
  secureBackend: SecureBackendSchema.default('local-encrypted'),
  operatorTokenRef: z.string().min(1).optional(),
});
```

- [ ] **Step 4: Update network-config-paths.ts**

Replace the `network.secureBackend` values array with `['1password', 'bitwarden', 'os-keychain', 'local-encrypted']`.

Add `'network.operatorTokenRef': { type: 'string', sensitive: true }` to `NETWORK_CONFIG_PATH_DEFINITIONS`.

- [ ] **Step 5: Update network-secrets.ts**

Add `'network.operatorTokenRef'` to `SENSITIVE_CONFIG_PATHS`.

Update `osStoreBackend` import to reference the renamed backend (id: `'os-keychain'`).

- [ ] **Step 6: Remove superseded `createSecretRef` and its test**

The old `createSecretRef()` in `network-secrets.ts` generated `secret://` URI refs. This is replaced by the new `ISecretStore` architecture where logical keys are stored directly in config. Remove:
- `createSecretRef()` function from `src/network/network-secrets.ts`
- The test `'stores sensitive config values as opaque refs, not raw values'` from `tests/unit/network/network-secrets.test.ts`
- The `createSecretRef` import from the test file

- [ ] **Step 7: Update existing tests**

Update `tests/unit/network/secret-backends.test.ts`:
- Change expected `'os-store'` to `'os-keychain'` in the detection order assertion

- [ ] **Step 8: Run all affected tests**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/network/`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add packages/franken-orchestrator/src/network/network-config.ts packages/franken-orchestrator/src/network/network-config-paths.ts packages/franken-orchestrator/src/network/network-secrets.ts packages/franken-orchestrator/tests/unit/network/
git commit -m "feat(secret-store): consolidate OS backends to os-keychain, add operatorTokenRef, remove createSecretRef"
```

---

## Chunk 6: Init Wizard Updates

### Task 9: Update InitState types (merged with Task 10 — type + behavior tested together)

**Files:**
- Modify: `src/init/init-types.ts`

- [ ] **Step 1: Update InitStepId and InitState**

Add `'secret-backend-selection'` to `InitStepId` union.

- [ ] **Step 2: Run existing init tests**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/init/`
Expected: PASS (additive change only)

- [ ] **Step 3: Commit**

```bash
git add packages/franken-orchestrator/src/init/init-types.ts
git commit -m "feat(secret-store): add secret-backend-selection to InitStepId"
```

### Task 10: Update init wizard with backend selection and raw prompts

**Files:**
- Modify: `src/init/init-wizard.ts`
- Modify: `tests/unit/init/init-wizard.test.ts` (or create if doesn't exist)

- [ ] **Step 1: Write failing tests for new wizard flow**

Test the following scenarios:
1. Backend selection step is added after security mode
2. Wizard prompts for raw token values (not refs)
3. Wizard calls `secretStore.store()` for each secret
4. Operator token auto-generation when blank
5. `InitWizardScope` includes `'secret-backend'`
6. Scope-targeted re-runs only run the secret backend step
7. Re-running with `scope='slack'` does NOT re-prompt if key is already stored in config (existing guard logic: `currentBotTokenRef.length === 0` suppresses prompt when a logical key is already present)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/init/init-wizard.test.ts`
Expected: FAIL

- [ ] **Step 3: Update init-wizard.ts**

Changes:
1. Add `'secret-backend'` to `InitWizardScope` type
2. Add `secretStore?: ISecretStore` to `RunInitWizardOptions`
3. After security mode selection, add backend detection and selection step
4. Change comms secret prompts from "ref" to raw value prompts
5. After collecting raw value, call `secretStore.store(key, rawValue)` if store provided
6. Add operator token prompt with auto-generate logic (`randomBytes(32).toString('hex')`)
7. Add `'secret-backend-selection'` to `completedSteps`

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/init/init-wizard.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/init/init-wizard.ts packages/franken-orchestrator/tests/unit/init/
git commit -m "feat(secret-store): add backend selection and raw secret prompts to init wizard"
```

### Task 11: Wire secret store into init engine and init command

**Files:**
- Modify: `src/init/init-engine.ts`
- Modify: `src/cli/init-command.ts`
- Modify: `src/init/init-verify.ts`

- [ ] **Step 1: Update init-engine.ts**

Add `secretStore?: ISecretStore` to `RunInteractiveInitOptions` and `RunRepairInitOptions`. Pass through to `runInitWizard()`.

- [ ] **Step 2: Update init-command.ts**

In `handleInitCommand()`:
1. Read current config to get `network.secureBackend`
2. Create `ISecretStore` via `createSecretStore()`
3. Pass to `runInteractiveInit()`/`runRepairInit()`

- [ ] **Step 3: Update init-verify.ts**

Add `'secret-backend-unavailable'` to `InitIssueCode`. In `verifyInit()`, check that the configured backend is available via `store.detect()`.

- [ ] **Step 4: Run all init tests**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/init/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/init/ packages/franken-orchestrator/src/cli/init-command.ts
git commit -m "feat(secret-store): wire secret store into init engine and verification"
```

---

## Chunk 7: Runtime Boot Sequence Updates

### Task 12: Update resolveBeastOperatorToken to use secret store

**Files:**
- Modify: `src/cli/run.ts` (**SHARED with agent-init plan — READ FIRST**)
- Modify: `tests/unit/cli/run.test.ts`

> **WARNING:** `run.ts` may have been modified by the agent-init workflow plan. Read the current file before editing. The `resolveBeastOperatorToken()` function and the `chat-server` startup block are the only targets — do not touch agent-related code.

- [ ] **Step 1: Write failing test**

Add test: `resolveBeastOperatorToken` checks secret store first before falling back to env vars.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/cli/run.test.ts`
Expected: FAIL

- [ ] **Step 3: Update resolveBeastOperatorToken**

Add `secretStore?: ISecretStore` parameter. Try `secretStore.resolve('network.operatorTokenRef')` first. If undefined, fall back to existing env var / .env file logic.

In the `chat-server` startup path, create the secret store from config and pass it to `resolveBeastOperatorToken()`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/cli/run.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `cd packages/franken-orchestrator && npx vitest run`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/franken-orchestrator/src/cli/run.ts packages/franken-orchestrator/tests/unit/cli/
git commit -m "feat(secret-store): resolve operator token from secret store at boot"
```

---

## Chunk 8: ADRs, Documentation, and Example Config

### Task 13: Write ADR-018 — Secret Store Architecture

**Files:**
- Create: `docs/adr/018-secret-store-architecture.md`

- [ ] **Step 1: Write ADR-018**

Follow the template from `docs/adr/ADR-000-template.md`. Cover:
- **Context:** Why the old "token ref" approach was insufficient, why secrets need first-class management
- **Decision:** `ISecretStore` interface with 4 backends behind a factory, logical key convention, single `network.secureBackend` source of truth, supervisor-only resolution with DI to children
- **Consequences:** Positive (secrets encrypted at rest, pluggable backends, no plaintext in config), Negative (passphrase prompts for local-encrypted, CLI dependency for external backends)
- **Alternatives Considered:** URI-based refs (`secret://backend/key`), per-ref backend override, env-var-only approach

- [ ] **Step 2: Commit**

```bash
git add docs/adr/018-secret-store-architecture.md
git commit -m "docs: ADR-018 secret store architecture"
```

### Task 14: Write ADR-019 — Secret Backend Comparison

**Files:**
- Create: `docs/adr/019-secret-backend-comparison.md`

- [ ] **Step 1: Write ADR-019**

Cover:
- **Context:** Need to choose and document which backends to support and recommend
- **Decision:** Recommendation ranking: 1Password (recommended) > OS Keychain > Local Encrypted > Bitwarden
- **Comparison table:**

| Backend | Security | Ergonomics | Cloud Sync | Platform | Recommended For |
|---|---|---|---|---|---|
| 1Password | Strongest — hardware-backed, biometric, audit trail | Excellent — `op` CLI, biometric unlock | Yes | All | Production, teams |
| OS Keychain | Strong — OS-level protection, system unlock | Good on macOS/Windows, fragile on WSL2 | No | All (WSL2 limited) | Single-machine dev |
| Local Encrypted | Good — AES-256-GCM, passphrase-dependent | OK — passphrase prompt each session | No | All | Dev, CI |
| Bitwarden | Strong — E2E encrypted | Rough — session token management | Yes | All | Users already on Bitwarden |

- **Consequences:** 1Password recommended as default but local-encrypted is the fallback for zero-install setup

- [ ] **Step 2: Commit**

```bash
git add docs/adr/019-secret-backend-comparison.md
git commit -m "docs: ADR-019 secret backend comparison and recommendations"
```

### Task 15: Create frankenbeast.example.json

**Files:**
- Create: `frankenbeast.example.json` (at repo root)

- [ ] **Step 1: Write the example config**

```json
{
  "maxCritiqueIterations": 3,
  "maxTotalTokens": 100000,
  "maxDurationMs": 300000,
  "enableHeartbeat": true,
  "enableTracing": true,
  "minCritiqueScore": 0.7,
  "providers": {
    "default": "claude",
    "fallbackChain": ["claude", "codex"],
    "overrides": {}
  },
  "network": {
    "mode": "secure",
    "secureBackend": "local-encrypted",
    "operatorTokenRef": "network.operatorTokenRef"
  },
  "chat": {
    "enabled": true,
    "host": "127.0.0.1",
    "port": 3737,
    "model": "claude-sonnet-4-6"
  },
  "dashboard": {
    "enabled": true,
    "host": "127.0.0.1",
    "port": 5173,
    "apiUrl": "http://127.0.0.1:3737"
  },
  "comms": {
    "enabled": false,
    "host": "127.0.0.1",
    "port": 3200,
    "orchestratorWsUrl": "ws://127.0.0.1:3737/v1/chat/ws",
    "orchestratorTokenRef": "comms.orchestratorTokenRef",
    "slack": {
      "enabled": false,
      "appId": "A0XXXXXXXXX",
      "botTokenRef": "comms.slack.botTokenRef",
      "signingSecretRef": "comms.slack.signingSecretRef"
    },
    "discord": {
      "enabled": false,
      "applicationId": "123456789012345678",
      "botTokenRef": "comms.discord.botTokenRef",
      "publicKeyRef": "your-discord-public-key-hex"
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add frankenbeast.example.json
git commit -m "docs: add frankenbeast.example.json with all config properties"
```

### Task 16: Update README with Secret Management section

**Files:**
- Modify: `README.md` (root)
- Modify: `packages/franken-web/README.md` (**SHARED with agent-init plan — READ FIRST, append only**)

- [ ] **Step 1: Add Secret Management section to root README**

Add after the existing setup section. Include:
- How secrets work (logical keys, `network.secureBackend`)
- Backend comparison table (from ADR-019)
- Setup instructions per backend (1Password, Bitwarden, OS Keychain, Local Encrypted)
- Operator token setup:
  ```
  # During init, the wizard auto-generates an operator token.
  # Copy the printed value to your dashboard .env:
  VITE_BEAST_OPERATOR_TOKEN=<generated-hex-value>
  ```
- `FRANKENBEAST_PASSPHRASE` for CI/non-interactive
- Link to ADRs for full rationale

- [ ] **Step 2: Update franken-web README**

Add section explaining `VITE_BEAST_OPERATOR_TOKEN`:
- What it is (auth token for the Beast HTTP API)
- How to get it (`frankenbeast init` generates it)
- Where to set it (`.env.local` in `packages/franken-web/`)
- Security note: never commit `.env.local`

- [ ] **Step 3: Commit**

```bash
git add README.md packages/franken-web/README.md
git commit -m "docs: add Secret Management guide to README and franken-web setup"
```

### Task 17: Update RAMP_UP and ARCHITECTURE docs

**Files:**
- Modify: `docs/RAMP_UP.md` (**SHARED with agent-init plan — READ FIRST, append only**)
- Modify: `docs/ARCHITECTURE.md` (**SHARED with agent-init plan — READ FIRST, append only**)

- [ ] **Step 1: Add secret store to RAMP_UP.md**

Brief mention of:
- Secret backends (4 types, `ISecretStore` interface)
- Config stores logical keys, not secrets
- `SecretResolver` resolves at boot in supervisor

- [ ] **Step 2: Add secret store section to ARCHITECTURE.md**

Add Mermaid diagram showing:
```
Init Wizard → ISecretStore → Backend (1password/bitwarden/os-keychain/local-encrypted)
Network Supervisor → SecretResolver → ISecretStore → Backend
SecretResolver → ResolvedSecrets → Service Deps
```

- [ ] **Step 3: Commit**

```bash
git add docs/RAMP_UP.md docs/ARCHITECTURE.md
git commit -m "docs: add secret store to RAMP_UP and ARCHITECTURE"
```

### Task 18: Final integration test and cleanup

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No type errors

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Verify no untracked files that should be gitignored**

Run: `git status`
Verify: No secret files, build artifacts, or generated output in untracked

- [ ] **Step 5: Final commit if any cleanup needed**

```bash
git add -A && git commit -m "chore: final cleanup for secret store implementation"
```
