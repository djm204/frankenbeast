# Secret Store Architecture — Design Specification

**Date:** 2026-03-11
**Status:** Draft

## Problem

The init wizard currently asks for "token refs" — raw strings the user must manage themselves.
The 4 secret backends (`1password`, `bitwarden`, `os-store`, `local-encrypted`) exist only
as catalog entries with no `store()` or `resolve()` methods. There is no runtime secret
resolution — `resolveBeastOperatorToken()` reads env vars directly. The `VITE_BEAST_OPERATOR_TOKEN`
has no config path and lives only in `.env` files. There is no setup guide.

## Goals

1. All 4 secret backends fully functional: store and resolve secrets
2. Init wizard detects available backends, prints setup instructions for unavailable ones
3. Wizard accepts **raw secret values** (not refs), stores them via the selected backend
4. Runtime `SecretResolver` resolves logical keys to plaintext at boot
5. `network.operatorTokenRef` added to config schema for the Beast operator token
6. `frankenbeast.example.json` created with all config properties
7. ADRs for the architecture decision + each backend's trade-offs
8. README updated with setup guide, backend comparison, and recommendations

## Architecture

### ISecretStore Interface

```ts
export interface ISecretStore {
  readonly id: string;

  /** Check if this backend is available on the current system. */
  detect(): Promise<SecretStoreDetection>;

  /** Store a secret under a logical key. Upsert semantics: creates if new, updates if exists. */
  store(key: string, value: string): Promise<void>;

  /** Retrieve a secret by logical key. Returns undefined if not found. */
  resolve(key: string): Promise<string | undefined>;

  /** Delete a secret by logical key. */
  delete(key: string): Promise<void>;

  /** List all stored logical keys (not values). */
  keys(): Promise<string[]>;
}

export interface SecretStoreDetection {
  available: boolean;
  /** Human-readable reason if unavailable. */
  reason?: string;
  /** Setup instructions if unavailable. */
  setupInstructions?: string;
}
```

### Secret Key Convention

All secrets use dot-notation logical keys matching their config path:

| Config Path | Logical Key | Description |
|---|---|---|
| `network.operatorTokenRef` | `network.operatorTokenRef` | Beast HTTP API auth token |
| `comms.orchestratorTokenRef` | `comms.orchestratorTokenRef` | Comms→Orchestrator WS token |
| `comms.slack.botTokenRef` | `comms.slack.botTokenRef` | Slack bot OAuth token |
| `comms.slack.signingSecretRef` | `comms.slack.signingSecretRef` | Slack request signing secret |
| `comms.discord.botTokenRef` | `comms.discord.botTokenRef` | Discord bot token |
| `comms.discord.publicKeyRef` | — | Discord interaction public key (public value, stored in config directly, NOT in secret store) |

Config stores only the **logical key** string (e.g., `"comms.slack.botTokenRef"`).
The backend is determined globally by `network.secureBackend`.

### Backend Implementations

#### 1. Local Encrypted (always available — fallback)

- **Storage:** `.frankenbeast/secrets.enc` (AES-256-GCM encrypted JSON blob)
- **Key derivation:** PBKDF2 (100,000 iterations, SHA-512) from user passphrase
- **Metadata:** `.frankenbeast/secrets.meta.json` — stores salt (hex), IV per encrypt op
- **On first `store()`:** Prompts for passphrase, derives key, persists salt
- **On `resolve()`:** Prompts for passphrase (or reads from `FRANKENBEAST_PASSPHRASE` env var)
- **In-process caching:** Derived key cached for session lifetime to avoid re-prompting
- **`detect()`:** Always `{ available: true }`
- **Security posture:** Secrets at rest are AES-256-GCM encrypted. Passphrase strength is user-dependent. No hardware-backed protection. Acceptable for development; not recommended for production with shared machines.

#### 2. 1Password (recommended)

- **Detection:** `which op` + `op --version`
- **`store()`:** Upsert: attempt `op item get "frankenbeast/<key>" --vault=frankenbeast` first. If exists, `op item edit "frankenbeast/<key>" --vault=frankenbeast password=<value>`. If not, `op item create --category=password --title="frankenbeast/<key>" --vault=frankenbeast password=<value>`.
- **`resolve()`:** `op read "op://frankenbeast/frankenbeast%2F<key>/password"` (URL-encoded `/`)
- **`delete()`:** `op item delete "frankenbeast/<key>" --vault=frankenbeast`
- **`keys()`:** `op item list --vault=frankenbeast --format=json` → extract titles
- **`detect()` setup instructions when missing:**
  ```
  1. Install 1Password CLI: https://developer.1password.com/docs/cli/get-started
  2. Sign in: op signin
  3. Create a vault: op vault create frankenbeast
  ```
- **Security posture:** Hardware-backed on supported devices, biometric unlock, audit trail, sync across machines. Strongest option.

#### 3. Bitwarden

- **Detection:** `which bw` + `bw --version`
- **Session management:** `bw unlock` returns a session token; stored in `BW_SESSION` env var for command duration
- **`store()`:** Upsert: attempt `bw get item "frankenbeast/<key>"` first. If exists, extract UUID then `bw edit item <uuid>` with updated JSON payload. If not, `bw create item` with JSON payload via stdin (type 2 = Secure Note, name = `frankenbeast/<key>`, notes = value).
- **`resolve()`:** `bw get item "frankenbeast/<key>"` → parse JSON → extract `notes` field
- **`delete()`:** `bw delete item <id>` (ID obtained from `bw get item`)
- **`keys()`:** `bw list items --search "frankenbeast/"` → extract names
- **`detect()` setup instructions when missing:**
  ```
  1. Install Bitwarden CLI: https://bitwarden.com/help/cli/
  2. Log in: bw login
  3. Unlock vault: bw unlock
  ```
- **Security posture:** End-to-end encrypted, cloud-synced. Good option but CLI ergonomics are rougher (session token management).

#### 4. OS Keychain

- **Platform detection matrix:**

  | Platform | Tool | Extra Requirements |
  |---|---|---|
  | macOS | `security` (built-in) | None |
  | Linux (native) | `secret-tool` | `gnome-keyring`, D-Bus |
  | Linux (WSL2) | `secret-tool` | Same + manual D-Bus start |
  | Windows | `cmdkey` (built-in) | None |

- **Linux/WSL2:**
  - `store()`: `secret-tool store --label="frankenbeast/<key>" service frankenbeast key <key>` (value via stdin)
  - `resolve()`: `secret-tool lookup service frankenbeast key <key>`
  - `delete()`: `secret-tool clear service frankenbeast key <key>`
  - `keys()`: Parse `secret-tool search service frankenbeast` output

- **macOS:**
  - `store()`: `security add-generic-password -U -s frankenbeast -a <key> -w <value>`
  - `resolve()`: `security find-generic-password -s frankenbeast -a <key> -w`
  - `delete()`: `security delete-generic-password -s frankenbeast -a <key>`
  - `keys()`: `security dump-keychain` filtered by service=frankenbeast

- **Windows:**
  - `store()`: `cmdkey /generic:frankenbeast/<key> /user:frankenbeast /pass:<value>`
  - `resolve()`: PowerShell `Get-StoredCredential -Target "frankenbeast/<key>"`
  - `delete()`: `cmdkey /delete:frankenbeast/<key>`
  - `keys()`: `cmdkey /list` filtered by `frankenbeast/`

- **`detect()` setup instructions (Linux/WSL2 when `secret-tool` missing):**
  ```
  1. Install gnome-keyring and secret-tool:
     sudo apt install gnome-keyring libsecret-tools
  2. Start D-Bus (required for keyring access):
     sudo service dbus start
  3. Initialize the keyring (first time only):
     echo '' | gnome-keyring-daemon --unlock
  ```
- **WSL2 warning:**
  ```
  WSL2 detected: D-Bus must be running for OS Keychain.
  Run 'sudo service dbus start' each session, or add to shell profile.
  Consider 1Password or Local Encrypted for smoother WSL2 experience.
  ```
- **Security posture:** OS-level protection, integrates with system unlock. Good for single-machine use. No cloud sync. WSL2 support is fragile.

### SecretStoreFactory

```ts
export function createSecretStore(
  backendId: SecureBackend,
  options: SecretStoreOptions,
): ISecretStore;

export interface SecretStoreOptions {
  /** Project root — used for .frankenbeast/ paths */
  projectRoot: string;
  /** IO for passphrase prompts (local-encrypted backend) */
  io?: InterviewIO;
  /** Override passphrase (for non-interactive / CI use) */
  passphrase?: string;
}
```

### SecretResolver (runtime)

```ts
export class SecretResolver {
  constructor(private readonly store: ISecretStore) {}

  /** Resolve a single secret. Throws if required and not found. */
  async resolve(key: string): Promise<string | undefined>;

  /** Resolve all sensitive config keys. Fails fast on missing required secrets. */
  async resolveAll(config: OrchestratorConfig): Promise<ResolvedSecrets>;
}

export interface ResolvedSecrets {
  operatorToken?: string;
  orchestratorToken?: string;
  slackBotToken?: string;
  slackSigningSecret?: string;
  discordBotToken?: string;
}
// Note: discordPublicKey is a public value — stored directly in config, not in secret store
```

### Config Schema Changes

Add to `NetworkOperatorConfigSchema`:

```ts
export const NetworkOperatorConfigSchema = z.object({
  mode: NetworkModeSchema.default('secure'),
  secureBackend: SecureBackendSchema.default('local-encrypted'),
  operatorTokenRef: z.string().min(1).optional(),  // NEW
});
```

Add `network.operatorTokenRef` to `NETWORK_CONFIG_PATH_DEFINITIONS` as `{ type: 'string', sensitive: true }`.

Update `SENSITIVE_CONFIG_PATHS` in `network-secrets.ts` to include `network.operatorTokenRef`.

### SecureBackendSchema Update

Consolidate the 3 OS-specific backends into a single `os-keychain` value:

```ts
export const SecureBackendSchema = z.enum([
  '1password',
  'bitwarden',
  'os-keychain',      // was: macos-keychain, windows-credential-manager, linux-secret-service
  'local-encrypted',
]);
```

The `OsKeychainStore` implementation auto-detects the platform internally.

**Migration for existing configs:** Add a Zod `.preprocess()` step to `SecureBackendSchema` that maps
the old values (`macos-keychain`, `windows-credential-manager`, `linux-secret-service`) to `os-keychain`.
This ensures existing `.frankenbeast/config.json` files parse without error after upgrade. The old
values are silently rewritten to `os-keychain` on next config save.

```ts
export const SecureBackendSchema = z.preprocess(
  (val) => {
    const LEGACY_MAP: Record<string, string> = {
      'macos-keychain': 'os-keychain',
      'windows-credential-manager': 'os-keychain',
      'linux-secret-service': 'os-keychain',
    };
    return typeof val === 'string' ? (LEGACY_MAP[val] ?? val) : val;
  },
  z.enum(['1password', 'bitwarden', 'os-keychain', 'local-encrypted']),
);
```

### Init Wizard Changes

#### New step: Secret backend selection (after security mode)

```
Detecting available secret backends...
  ✓ 1Password CLI (op v2.x)
  ✗ Bitwarden CLI — not found
  ✓ OS Keychain (secret-tool)
  ✓ Local Encrypted Store

Select secret backend [1password/os-keychain/local-encrypted] (recommended: 1password):
```

If unavailable backend selected → print setup instructions → re-prompt.

#### Changed prompts: raw values instead of refs

```
Slack bot token (xoxb-...):          # was "Slack bot token ref"
Slack signing secret:                # was "Slack signing secret ref"
Discord bot token:                   # was "Discord bot token ref"
```

Wizard calls `secretStore.store(key, rawValue)` immediately, writes logical key into config.

#### New: Operator token prompt

```
Beast operator token (leave blank to auto-generate):
```

If blank → generates via `randomBytes(32).toString('hex')`, stores it, prints:
```
Generated operator token stored in secret backend.
Set VITE_BEAST_OPERATOR_TOKEN in your dashboard .env to this value:
  <hex value>
```

#### InitState additions

```ts
export type InitStepId =
  | 'module-selection'
  | 'provider-config'
  | 'security-selection'
  | 'secret-backend-selection'   // NEW
  | 'comms-transport-selection';
```

Add `'secret-backend'` to `InitWizardScope` for targeted re-runs:

```ts
export type InitWizardScope = 'modules' | 'provider' | 'security' | 'secret-backend' | 'slack' | 'discord';
```

The new backend selection step uses `scope.has('secret-backend')` guard, matching the existing pattern.

### Boot Sequence (`network up`)

1. Load config from `.frankenbeast/config.json`
2. Create `ISecretStore` from `config.network.secureBackend` via factory
3. `secretResolver.resolveAll(config)` — called **exactly once in the supervisor process**, fails fast if any required secret missing
4. Pass resolved plaintext values into child service deps via constructor injection (never env vars for secrets)
5. Start services

**Important:** Child service processes (chat-server, comms-gateway, dashboard) never instantiate
`ISecretStore` directly. The supervisor resolves all secrets once, then passes plaintext values
into each service's dependency injection. This avoids repeated passphrase prompts and ensures
the secret store is only accessed from a single interactive process.

`resolveBeastOperatorToken()` updated to try secret store first, fall back to env vars.

### Passphrase Handling (local-encrypted)

- Interactive mode: prompt via `InterviewIO`
- Non-interactive / CI: read from `FRANKENBEAST_PASSPHRASE` env var
- Security warning in docs: "Do not set FRANKENBEAST_PASSPHRASE in shell history or scripts committed to version control"
- In-process derived key cache (never written to disk)

### .gitignore Requirements

The following files MUST be added to `.gitignore` before implementing `LocalEncryptedStore`:

```
# Secret store files — NEVER commit
.frankenbeast/secrets.enc
.frankenbeast/secrets.meta.json
```

Committing both `secrets.enc` (ciphertext) and `secrets.meta.json` (salt) together gives an attacker
everything needed for offline PBKDF2 cracking. The implementation MUST verify `.gitignore` coverage
as a precondition of `LocalEncryptedStore.store()`.

## Deliverables

### ADRs (in `docs/adr/`)

1. **ADR-018: Secret store architecture** — the `ISecretStore` interface, logical key convention, single `network.secureBackend` source of truth, factory pattern
2. **ADR-019: Secret backend comparison and recommendations** — security trade-offs per backend, recommendation ranking (1Password > OS Keychain > Local Encrypted > Bitwarden for ergonomics), platform matrix

### Documentation

3. **README.md** — new "Secret Management" section:
   - How secrets work (logical keys, backend selection)
   - Backend comparison table with security ratings and recommendations
   - Setup instructions per backend
   - Operator token setup for dashboard
   - `FRANKENBEAST_PASSPHRASE` for CI/non-interactive

4. **`frankenbeast.example.json`** — complete example config with all properties set

### Code

5. **`ISecretStore` interface + `SecretStoreFactory`** — `src/network/secret-store.ts`
6. **`LocalEncryptedStore`** — AES-256-GCM implementation
7. **`OnePasswordStore`** — 1Password CLI wrapper
8. **`BitwardenStore`** — Bitwarden CLI wrapper
9. **`OsKeychainStore`** — platform-detecting OS keychain wrapper
10. **`SecretResolver`** — runtime resolution service
11. **Init wizard updates** — backend detection, raw value prompts, operator token generation
12. **Config schema changes** — `network.operatorTokenRef`, consolidated `os-keychain`
13. **Boot sequence updates** — secret resolution in `network up` path
14. **Tests** — unit tests for each backend, integration tests for wizard flow and resolution

### Files Affected

| File | Change |
|---|---|
| `src/network/secret-store.ts` | NEW — `ISecretStore`, `SecretStoreFactory`, `SecretResolver` |
| `src/network/secret-backends/local-encrypted-store.ts` | REWRITE — full `ISecretStore` impl |
| `src/network/secret-backends/one-password.ts` | REWRITE — full `ISecretStore` impl |
| `src/network/secret-backends/bitwarden.ts` | REWRITE — full `ISecretStore` impl |
| `src/network/secret-backends/os-store.ts` | REWRITE → `os-keychain.ts` — full `ISecretStore` impl |
| `src/network/network-config.ts` | EDIT — add `operatorTokenRef`, consolidate `os-keychain` |
| `src/network/network-config-paths.ts` | EDIT — add `network.operatorTokenRef` path, update `network.secureBackend` enum values (replace 3 OS-specific with `os-keychain`) |
| `src/network/network-secrets.ts` | EDIT — add `operatorTokenRef` to sensitive paths, update factory |
| `src/init/init-types.ts` | EDIT — add `secret-backend-selection` step |
| `src/init/init-wizard.ts` | EDIT — backend selection, raw prompts, operator token, add `'secret-backend'` to `InitWizardScope` |
| `.gitignore` | EDIT — add `.frankenbeast/secrets.enc`, `.frankenbeast/secrets.meta.json` |
| `src/cli/run.ts` | EDIT — resolve operator token from secret store |
| `README.md` (root) | EDIT — add Secret Management section |
| `packages/franken-web/README.md` | EDIT — operator token setup instructions |
| `frankenbeast.example.json` | NEW — complete example config |
| `docs/adr/018-secret-store-architecture.md` | NEW |
| `docs/adr/019-secret-backend-comparison.md` | NEW |
| Tests (unit + integration) | NEW — per backend, wizard flow, resolution |
