# ADR-018: Secret Store Architecture

- **Date:** 2026-03-11
- **Status:** Accepted
- **Deciders:** frankenbeast core team

## Context

The old "token ref" approach stored opaque reference strings in config (e.g., `botTokenRef: "SLACK_BOT_TOKEN"`) but had no actual secret management behind it — tokens were resolved directly from environment variables or `.env` files at runtime. This approach had several critical gaps:

- No encryption at rest: secrets lived in plaintext environment variables or `.env` files on disk
- No audit trail: no record of when or by which process a secret was accessed
- No secure storage: `.env` files can be accidentally committed, leaked via process env dumps, or read by any process with the same uid
- Poor ergonomics for multiple secrets: each secret required a separate env var, with no unified resolution path
- No path to team or production secret sharing without adopting an external system ad hoc

The system needed first-class secret management that could grow from local development to production team use without changing the application config schema.

## Decision

Implement an `ISecretStore` interface with 4 pluggable backends behind a `SecretStoreFactory`. The architecture separates three concerns:

1. **Config schema** — stores logical key strings (e.g., `comms.slack.botTokenRef: "slack-bot-token"`), never plaintext secrets
2. **Backend selection** — a single `network.secureBackend` field in project config determines which backend resolves all secrets for a project
3. **Resolution** — a `SecretResolver` runs in the supervisor process at boot, fetches plaintext values from the selected backend, and passes them to child services via dependency injection

### ISecretStore Interface

```typescript
interface ISecretStore {
  get(key: string): Promise<string>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(): Promise<string[]>;
}
```

### Backends

| Backend | Mechanism | Notes |
|---------|-----------|-------|
| `local-encrypted` | AES-256-GCM + PBKDF2, stored in `.frankenbeast/secrets.enc` | Zero-install fallback, passphrase-protected |
| `1password` | `op` CLI subprocess | Requires 1Password CLI installation and sign-in |
| `bitwarden` | `bw` CLI subprocess | Requires Bitwarden CLI, session token management |
| `os-keychain` | Platform-detected: `secret-tool` (Linux), `security` (macOS), `cmdkey` (Windows) | WSL2 uses `secret-tool` but keyring may not be unlocked |

### SecretStoreFactory

```typescript
function createSecretStore(backend: SecretBackend, opts: SecretStoreOptions): ISecretStore
```

The factory reads `network.secureBackend` from project config and instantiates the appropriate backend. All backends implement `ISecretStore` so the rest of the system is backend-agnostic.

### Config Migration

Existing configs using the old `*Ref` env-var convention are migrated transparently via `z.preprocess` in the Zod schema: if a value looks like an env var name (all-caps, underscores), it is automatically treated as a `local-encrypted` key reference, preserving backward compatibility without requiring a manual migration step.

### Resolution Flow

```
boot: supervisor reads project config
  → reads network.secureBackend
  → SecretStoreFactory.create(backend)
  → SecretResolver.resolveAll(config, store)
      → for each *Ref field: store.get(refKey) → plaintext
  → inject plaintext into child service constructors
  (plaintext never written to disk or logged)
```

## Consequences

### Positive

- Secrets encrypted at rest for all users, even on the zero-install `local-encrypted` path
- Pluggable backends: teams can adopt 1Password or Bitwarden without changing application code
- No plaintext secrets in config files, committed repos, or process environment dumps
- Backward-compatible migration: existing `*Ref` env-var configs continue to work via `z.preprocess`
- Single backend per project keeps resolution simple and auditable
- `ISecretStore` is mockable in tests — no real secrets required in CI

### Negative

- `local-encrypted` requires passphrase management: users must remember or store the passphrase securely, and loss means permanent secret loss
- External backends (`1password`, `bitwarden`) depend on CLI tool installation and authentication state at boot time — if the CLI is not installed or not signed in, the process cannot start
- OS keychain has WSL2 limitations: `secret-tool` requires a running D-Bus session with an unlocked keyring, which is not guaranteed in WSL2 terminal sessions

### Risks

- Passphrase loss for `local-encrypted` is irrecoverable — no key escrow
- CLI-based backends add subprocess spawn latency at boot and can fail silently if the CLI version changes its output format

## Alternatives Considered

| Option | Pros | Cons | Rejected Because |
|--------|------|------|-----------------|
| URI-based refs (`secret://backend/key`) | Per-ref backend flexibility | Larger attack surface (each ref could point to different backend); per-ref backend resolution logic scattered across codebase | Unnecessary complexity — single backend per project is sufficient and easier to audit |
| Per-ref backend override field in config | Fine-grained control | Config schema complexity multiplied; users must reason about backend per secret | Single `network.secureBackend` is simpler and sufficient for all identified use cases |
| Env-var-only approach (status quo) | Zero implementation cost | No encryption at rest; poor multi-secret ergonomics; `.env` files leak easily; no audit trail | Does not meet the security requirement for encrypted-at-rest secrets |
