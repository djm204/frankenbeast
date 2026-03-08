# Secure File Store Integrations — Implementation Plan

**Date:** 2026-03-08
**Status:** Proposed
**Scope:** Cross-module

## Goal

Add secure file storage integrations for:

- Google Drive
- Dropbox
- Amazon S3

These providers should appear inside Frankenbeast as optional file-store backends, not as direct credentialed filesystem mounts.

The design goal is:

- one canonical file-store abstraction
- provider-specific adapters underneath
- strict security controls around authentication, authorization, encryption, upload/download, auditing, and deletion

---

## Security Posture

Security is not a follow-up task here. It is the main design constraint.

This plan follows these rules:

- zero trust
- least privilege
- fail secure
- server-side validation at every boundary
- no plaintext secrets at rest
- no broad provider scopes when narrower scopes exist
- no direct client access to long-lived provider credentials

If a provider integration cannot meet those constraints, do not ship it.

---

## Product Model

Frankenbeast should be able to:

- connect to an approved external file store
- list allowed files/folders
- upload artifacts
- download artifacts
- reference files in chat and execution flows
- optionally persist agent outputs and logs

The system should not treat provider storage as a blind trust zone.

Every file operation should remain governed and auditable.

---

## Non-Goals

- Full desktop-style sync client
- Arbitrary local folder mirroring
- Shared-drive collaboration semantics in v1
- User-managed raw provider credentials pasted directly into prompts
- End-user direct browser access to provider credentials

---

## Recommended Package Shape

Create a new package: `franken-files`

```text
franken-files/
├── src/
│   ├── core/
│   │   ├── file-types.ts
│   │   ├── provider-types.ts
│   │   ├── file-store-config.ts
│   │   ├── policy.ts
│   │   └── errors.ts
│   ├── auth/
│   │   ├── oauth-state-store.ts
│   │   ├── token-store.ts
│   │   ├── key-envelope.ts
│   │   └── secret-provider.ts
│   ├── security/
│   │   ├── content-sniffer.ts
│   │   ├── checksum.ts
│   │   ├── quarantine.ts
│   │   ├── access-control.ts
│   │   └── audit-recorder.ts
│   ├── providers/
│   │   ├── google-drive/
│   │   ├── dropbox/
│   │   └── s3/
│   ├── gateway/
│   │   ├── file-store-service.ts
│   │   ├── provider-registry.ts
│   │   └── signed-url-broker.ts
│   ├── server/
│   │   ├── app.ts
│   │   ├── routes.ts
│   │   └── middleware.ts
│   └── index.ts
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
└── docs/
```

This keeps storage provider complexity and secret handling isolated from chat and orchestrator logic.

---

## Core Abstraction

Define a provider interface like:

```ts
interface FileStoreProvider {
  readonly providerId: 'google-drive' | 'dropbox' | 's3';
  list(input: ListFilesInput): Promise<ListFilesResult>;
  readMetadata(input: ReadMetadataInput): Promise<FileMetadata>;
  createUpload(input: CreateUploadInput): Promise<CreateUploadResult>;
  createDownload(input: CreateDownloadInput): Promise<CreateDownloadResult>;
  delete?(input: DeleteFileInput): Promise<void>;
}
```

Important:

- do not make delete mandatory in v1
- do not expose raw provider SDK types across the boundary
- separate metadata reads from content transfer

---

## Canonical File Model

Every file record should include:

- `fileId`
- `provider`
- `providerObjectId`
- `projectId`
- `ownerId` or linked principal
- `path` or display name
- `mimeType`
- `sizeBytes`
- `sha256`
- `createdAt`
- `updatedAt`
- `classification`
- `status`

Recommended statuses:

- `pending`
- `uploaded`
- `quarantined`
- `available`
- `deleted`
- `blocked`

---

## Security Model

## 1. Credential strategy

### Google Drive

Use OAuth 2.0 with the narrowest practical scope.

Preferred scope:

- `drive.file`

Avoid:

- full `drive` unless there is a proven requirement

### Dropbox

Use OAuth with App Folder access if that satisfies the use case.

Avoid:

- full Dropbox access by default

### S3

Prefer workload identity, IAM roles, or STS-issued short-lived credentials.

Avoid:

- root keys
- long-lived IAM user credentials when a role can be used instead

## 2. Token storage

Never store provider refresh tokens or access tokens in plaintext.

Use:

- encrypted token storage
- envelope encryption
- AES-256-GCM for stored secret blobs
- key versioning

Store encryption keys in:

- AWS Secrets Manager / KMS
- GCP Secret Manager / KMS
- Vault

Do not store data keys and encrypted tokens in the same trust boundary without separation.

## 3. Authorization model

Every file operation must check:

- who is requesting it
- which project it belongs to
- which provider connection is allowed
- whether the path/bucket/folder prefix is allowed
- whether the action is permitted: list, read, write, delete

Provider auth is not app auth. Both checks are required.

## 4. Upload/download model

Prefer server-brokered short-lived upload/download grants:

- pre-signed URLs for S3
- provider session upload links where appropriate
- short-lived broker tokens

Do not expose long-lived provider tokens to browsers or channel clients.

## 5. Content validation

For every upload:

- enforce file size limits
- inspect magic bytes, not just file extension
- compute checksum
- quarantine before general availability if scanning is enabled
- reject unsupported content types

## 6. Malware and unsafe content

If user-uploaded or external files are accepted:

- scan before making broadly available
- mark suspicious files as `quarantined`
- block retrieval until review or scan pass

## 7. Audit logging

Audit every operation:

- connect provider
- refresh token
- list
- upload initiated
- upload completed
- download generated
- delete requested
- permission denied
- signature/validation failure

Never log:

- access tokens
- refresh tokens
- signed URLs
- file contents

---

## Provider-Specific Design

## Google Drive

Best for:

- user-managed documents
- generated reports
- shared work artifacts

V1 constraints:

- use app-created or app-opened files only
- keep scope narrow
- store Drive file IDs, not just paths
- avoid assuming path stability

Security requirements:

- OAuth state validation
- PKCE where applicable
- encrypted token storage
- explicit allowlist of linked Google accounts or workspaces

## Dropbox

Best for:

- artifact exchange
- app-folder-style storage
- compact operator-managed file repositories

V1 constraints:

- prefer App Folder model
- keep metadata mapping strict
- prevent path traversal assumptions in virtual path mapping

Security requirements:

- OAuth state validation
- app-folder scoping
- encrypted token storage
- team-account restrictions if needed

## S3

Best for:

- large artifacts
- logs
- build outputs
- durable machine-managed storage

V1 constraints:

- bucket and prefix allowlists
- short-lived credentials only
- server-side encryption mandatory

Security requirements:

- IAM role or STS
- SSE-KMS
- bucket policy restricting allowed principals and prefixes
- presigned URL TTL limits
- object key normalization

---

## Connection and Key Management

## OAuth providers

For Google Drive and Dropbox:

- create explicit provider connection records
- bind connections to app principals
- store only encrypted refresh tokens
- derive connection-specific encryption context
- support token revocation and disconnect

Required connection metadata:

- provider
- external account id
- granted scopes
- connectedAt
- lastRefreshedAt
- key version
- status

## S3 connections

For S3:

- prefer named storage profiles, not arbitrary bucket credentials
- require bucket, region, allowed prefixes, and KMS key id
- support role assumption configuration

Avoid user-supplied raw access key pairs where possible.

---

## API Surface

Use Hono.

Suggested endpoints:

- `POST /v1/file-stores/connections/google-drive/start`
- `GET /v1/file-stores/connections/google-drive/callback`
- `POST /v1/file-stores/connections/dropbox/start`
- `GET /v1/file-stores/connections/dropbox/callback`
- `POST /v1/file-stores/connections/s3`
- `GET /v1/file-stores`
- `GET /v1/file-stores/:provider/files`
- `POST /v1/file-stores/:provider/files/upload`
- `POST /v1/file-stores/:provider/files/download`
- `DELETE /v1/file-stores/:provider/files/:id`

Every request must be:

- authenticated
- authorized
- schema validated
- rate limited

Delete should ship only if there is a real use case and HITL/governance coverage.

---

## Safe Defaults

V1 safe defaults should be:

- read/list/upload before delete
- narrow OAuth scopes
- App Folder for Dropbox
- `drive.file` for Google Drive
- S3 prefix allowlists
- encrypted token storage
- provider connections disabled until explicitly configured
- all signed URLs short-lived
- file size caps on all uploads
- deny unsupported MIME types

---

## Integration with Chat and Agent Flows

These file stores should be used through governed tools, not arbitrary shell access.

Recommended pattern:

- chat asks to save or retrieve a file
- tool call goes through `franken-files`
- policy layer checks allowed provider/action/path
- operation is recorded in audit and observer telemetry

The agent should never receive raw provider credentials in prompt context.

---

## Threat Model

Primary threats to design against:

- stolen OAuth refresh tokens
- leaked S3 credentials
- over-broad provider scopes
- cross-project file access
- path/prefix confusion
- malicious uploads
- signed URL leakage
- replayed webhook/OAuth callbacks
- insecure deletion
- accidental persistence of secrets in logs

Every phase below should be reviewed against those threats.

---

## Phased Delivery

## Phase 0 — ADRs and Threat Model

Deliverables:

- ADR for secure file-store abstraction
- ADR for token storage and envelope encryption
- ADR for provider-specific auth strategy
- written threat model

Tests:

- schema and config validation
- fail-closed config boot behavior

## Phase 1 — Core Types, Policy, and Audit

Deliverables:

- provider interface
- canonical file model
- access-control policy engine
- audit recorder

Tests:

- policy denies unapproved provider/action/path
- audit events emitted for all operations

## Phase 2 — Secure Token and Secret Handling

Deliverables:

- encrypted token store
- envelope encryption utility
- secret-provider abstraction
- key rotation support

Tests:

- tokens never stored plaintext
- decrypt fails with wrong key version
- rotation preserves access

## Phase 3 — S3 Adapter First

Ship S3 first because it has the most controllable security posture.

Deliverables:

- S3 provider adapter
- presigned upload/download flow
- prefix allowlist enforcement
- SSE-KMS enforcement

Tests:

- denies disallowed bucket/prefix
- presigned URL TTL respected
- upload/download metadata captured
- checksum persisted

## Phase 4 — Google Drive Adapter

Deliverables:

- OAuth start/callback flow
- narrow-scope token handling
- file metadata mapping
- app-approved upload/download flow

Tests:

- invalid state rejected
- unsupported scopes rejected
- disconnected tokens fail cleanly

## Phase 5 — Dropbox Adapter

Deliverables:

- OAuth flow
- App Folder mode
- metadata mapping
- upload/download support

Tests:

- invalid state rejected
- path mapping remains inside allowed app folder
- revoked tokens fail cleanly

## Phase 6 — Quarantine and Scanning

Deliverables:

- quarantine state machine
- optional scanner integration point
- release-from-quarantine workflow

Tests:

- unsupported file type blocked
- quarantined file not downloadable through normal path
- scan pass transitions correctly

## Phase 7 — HTTP API and Chat Tooling

Deliverables:

- Hono API
- tool-call bridge for chat/orchestrator
- observer metrics and audit integration

Tests:

- authz enforced on every endpoint
- validation errors return `422`
- chat tool calls cannot bypass policy

## Phase 8 — Hardening

Deliverables:

- connection revocation flow
- retention and token cleanup
- dependency review and SBOM additions
- startup self-checks

Tests:

- revoked connection blocks future operations
- stale signed URLs cannot be reused
- secrets redaction verified

---

## Recommended Order

1. Security ADRs and threat model
2. Core abstraction and policy layer
3. Token encryption and key management
4. S3 integration
5. Google Drive integration
6. Dropbox integration
7. Quarantine/scanning
8. API and agent tooling
9. Hardening

This order prioritizes the most controlled provider first and delays the broadest OAuth integrations until the security substrate exists.

---

## Why S3 First

S3 is the best first target because:

- IAM and STS are easier to constrain than end-user OAuth sprawl
- prefix allowlists are explicit
- presigned URLs are a clean broker model
- SSE-KMS and bucket policy controls are strong

Google Drive and Dropbox should come only after the token-security layer is proven.

---

## First Milestone

The first meaningful secure milestone is:

**"Frankenbeast can upload and download artifacts to a single approved S3 bucket prefix using short-lived credentials, SSE-KMS, checksums, policy enforcement, and full audit logs."**

If that is not solid, do not move on to Google Drive or Dropbox.

---

## Exit Criteria

This effort is complete when:

- all three providers are optional and individually configurable
- no provider credentials are exposed to clients or prompts
- token storage is encrypted and rotatable
- app-level authorization gates every file action
- file metadata and operations are audited
- upload/download flows use short-lived grants
- secure defaults are the only defaults
- tests cover auth, policy, crypto boundaries, and provider failure modes

