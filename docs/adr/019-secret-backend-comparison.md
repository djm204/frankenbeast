# ADR-019: Secret Backend Comparison and Recommendations

- **Date:** 2026-03-11
- **Status:** Accepted
- **Deciders:** frankenbeast core team

## Context

ADR-018 established the `ISecretStore` interface and the four supported backends. The choice of which backend to use is left to the project owner, but users need concrete guidance on the trade-offs to make an informed decision. Without documented recommendations, users default to the path of least resistance (`local-encrypted`) even when a more secure option is available and appropriate, or they attempt to use an external backend without understanding its operational requirements.

This ADR documents the comparison criteria, the recommendation ranking, and the rationale so that users — and future maintainers — can make the right choice for their context.

## Decision

Support 4 backends and publish the following recommendation ranking:

**1Password > OS Keychain > Local Encrypted > Bitwarden**

### Backend Comparison

| Backend | Security | Ergonomics | Cloud Sync | Platform | Recommended For |
|---------|----------|------------|------------|----------|-----------------|
| 1Password | Strongest — hardware-backed where available, biometric unlock, full audit trail | Excellent — `op` CLI integrates cleanly, biometric unlock in interactive sessions | Yes | All platforms | Production use, teams, any user already on 1Password |
| OS Keychain | Strong — OS-level protection, unlocked by system login | Good on macOS and Windows; fragile on WSL2 (requires unlocked D-Bus keyring) | No | All (WSL2 limited) | Single-machine developer use, no external dependency |
| Local Encrypted | Good — AES-256-GCM encryption, PBKDF2 key derivation, passphrase-dependent | OK — passphrase prompt once per session; passphrase loss is irrecoverable | No | All platforms | Development, CI (with passphrase in CI secret store), zero-install scenarios |
| Bitwarden | Strong — end-to-end encrypted vault, open source | Rough — requires active session token (`bw unlock`), token expires and must be refreshed | Yes | All platforms | Users already invested in Bitwarden who prefer to consolidate |

### Detailed Backend Notes

#### 1Password (`1password`)

- Requires the `op` CLI (1Password CLI v2+) to be installed and signed in
- In interactive sessions, `op` can use biometric authentication (Touch ID, Windows Hello) — no passphrase required at runtime
- Provides a full audit log of secret accesses in the 1Password dashboard
- Works in CI via service account tokens (`OP_SERVICE_ACCOUNT_TOKEN`)
- **Recommended default for production and team environments**

#### OS Keychain (`os-keychain`)

- macOS: uses `security` CLI (Keychain Access)
- Windows: uses `cmdkey`
- Linux (native): uses `secret-tool` (libsecret / GNOME Keyring)
- WSL2: uses `secret-tool` but the GNOME Keyring daemon may not be running; users may need to run `eval $(gnome-keyring-daemon --start)` manually or use a different backend
- No cloud sync: secrets are tied to the machine
- **Recommended for single-machine developer use when 1Password is not available**

#### Local Encrypted (`local-encrypted`)

- Stores encrypted blob at `.frankenbeast/secrets.enc`
- AES-256-GCM encryption with PBKDF2 key derivation from a user-supplied passphrase
- The `.enc` file is safe to commit to a private repo (encrypted), but the passphrase must be stored separately
- In CI, supply the passphrase via an environment variable (`FRANKENBEAST_STORE_PASSPHRASE`) which is itself stored in the CI system's secret store
- Passphrase loss = permanent secret loss (no key escrow)
- **Default fallback when no other backend is configured**

#### Bitwarden (`bitwarden`)

- Requires the `bw` CLI and an active session token (`bw unlock --passwordenv BW_PASSWORD` outputs `BW_SESSION`)
- Session tokens expire; scripts must handle re-authentication
- Self-hostable (Vaultwarden) for users who need on-premises storage
- **Recommended only for users already on Bitwarden** — the session token management overhead is not worth it otherwise

### Backend Selection in Config

```yaml
# .frankenbeast/config.yaml
network:
  secureBackend: "1password"   # or: os-keychain | local-encrypted | bitwarden
```

If `secureBackend` is omitted, the system defaults to `local-encrypted`.

## Consequences

### Positive

- Users have a clear ranked recommendation rather than having to evaluate four equal options
- The recommendation table is embedded in the ADR record, so it survives doc rot better than a wiki page
- `local-encrypted` as the zero-install default means new users can get started immediately without external tooling
- 1Password at the top of the ranking gives a clear migration target as projects mature from dev to production

### Negative

- 1Password is a paid product — the top recommendation is not free for all users
- OS Keychain recommendation comes with an explicit WSL2 caveat that adds cognitive overhead for Linux/WSL2 users
- The Bitwarden ranking (last) may frustrate Bitwarden users even though the backend is fully supported

### Risks

- CLI tool version changes in any external backend (`op`, `bw`, `security`, `secret-tool`) can break the integration silently if output format changes — this requires ongoing maintenance

## Alternatives Considered

| Option | Pros | Cons | Rejected Because |
|--------|------|------|-----------------|
| Support only `local-encrypted` and `1password` | Simpler support matrix | Excludes valid user needs (Bitwarden users, OS keychain preference) | Value of pluggable backends is lost if we arbitrarily restrict the set |
| No recommendation ranking — treat all backends as equal | Avoids appearing to favour paid products | Users paralysed by choice or pick the wrong backend for their context | A ranked recommendation with documented rationale is more helpful than false equivalence |
| Support HashiCorp Vault as a backend | Strong enterprise option | Adds significant operational complexity; no identified user need at this time | Can be added as a future backend without changing the interface; not in scope now |
