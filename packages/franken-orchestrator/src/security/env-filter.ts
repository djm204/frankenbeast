/**
 * Filters secret-shaped environment variables out of an env map before it is
 * handed to `spawn()` for a CLI subprocess (LLM provider CLIs in
 * `adapters/cli-llm-adapter.ts`, Martin-loop iterations in
 * `skills/martin-loop.ts`). Shared so both spawn paths apply the same rules
 * instead of drifting independently.
 *
 * This is a denylist rather than a hand-maintained allowlist: spawned CLI
 * subprocesses (claude/codex/gemini/aider) need broad standard environment
 * access to function (PATH, HOME, locale vars, npm/node config, etc.), so
 * allowlisting would be brittle and prone to breaking legitimate CLI
 * behavior. Only vars that look secret-shaped (by name or, for a small set of
 * known connection-string schemes, by value) are stripped.
 */

/**
 * Matches env var names that look like they carry a secret (API keys, tokens,
 * passwords, credentials, certs, etc.), checked on underscore-delimited
 * segments so unrelated names like `KEYBOARD_LAYOUT` are left alone. `PWD`
 * (the shell's present-working-directory var) is included as a segment so
 * `MYSQL_PWD` is caught, but the bare `PWD` name itself is special-cased as
 * safe below.
 */
const SECRET_ENV_NAME_PATTERN =
  /(?:^|_)(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|PASS|PASSPHRASE|CREDENTIALS?|AUTH|AUTHORIZATION|COOKIE|CERT|CERTIFICATE|WEBHOOK|PWD|PAT|JWT)(?:_|$)/i;

/**
 * Catches common secret-name segments written without a delimiter (e.g.
 * `APIKEY`, `PGPASSWORD` — psql's undelimited password env var).
 */
const SECRET_ENV_NAME_COMPOUND_PATTERN =
  /(?:APIKEY|ACCESSKEY|SECRETKEY|PRIVATEKEY|AUTHTOKEN|CLIENTSECRET|PASSWORD)/i;

/**
 * Exact names that don't match the generic patterns above but are secret
 * session tokens for external secret managers — a live one can unlock every
 * secret in the vault, so it must never reach a spawned CLI. `BW_SESSION` is
 * Bitwarden's session token; see `network/services/managed-service-env.ts`,
 * which deliberately forwards it to *trusted* managed services only.
 */
const KNOWN_SECRET_ENV_NAMES = new Set(['BW_SESSION']);

/**
 * Name patterns for secret-manager session tokens that are per-account and
 * so can't be listed as exact names — `OP_SESSION_<account>` is 1Password's
 * CLI session token, forwarded the same way (see managed-service-env.ts).
 * Deliberately narrow (not a bare `SESSION` segment): ordinary desktop/X11
 * session vars (`XDG_SESSION_ID`, `DESKTOP_SESSION`, `SESSION_MANAGER`,
 * `DBUS_SESSION_BUS_ADDRESS`, ...) are not secrets and must keep flowing.
 */
const SECRET_ENV_NAME_ADDITIONAL_PATTERNS: readonly RegExp[] = [/^OP_SESSION_[A-Za-z0-9_]+$/i];

/**
 * Env var names that would otherwise match the patterns above but are
 * capability/configuration pointers, not secrets themselves — e.g.
 * `SSH_AUTH_SOCK` is a path to the running ssh-agent's socket,
 * `SSL_CERT_FILE`/`NODE_EXTRA_CA_CERTS` point at CA bundle files, and
 * `DOCKER_CERT_PATH` (see `network/services/managed-service-env.ts`) points
 * at a directory of TLS client cert files for talking to a remote Docker
 * daemon. Stripping these breaks legitimate CLI behavior (git/ssh via the
 * user's agent, TLS trust for provider HTTPS calls, Docker client auth)
 * without reducing secret exposure, since none of them carry credential
 * material in the variable itself. `PWD` (present working directory) is
 * included for the same reason.
 */
const SAFE_ENV_NAME_EXCEPTIONS = new Set([
  'PWD',
  'SSH_AUTH_SOCK',
  'SSH_AGENT_PID',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'NODE_EXTRA_CA_CERTS',
  'DOCKER_CERT_PATH',
]);

/**
 * Git's indexed runtime-config mechanism (`GIT_CONFIG_COUNT` plus
 * `GIT_CONFIG_KEY_<n>` / `GIT_CONFIG_VALUE_<n>` pairs) is how this repo
 * itself injects config into spawned git commands (see
 * `beasts/execution/docker-container-runtime.ts`). The `KEY` segment in
 * `GIT_CONFIG_KEY_0` refers to a config key *name* (e.g. `safe.directory`),
 * not a secret — stripping it silently breaks every git command the CLI
 * runs. Exempt the whole indexed tuple by name shape rather than by value,
 * since the mechanism is inherently non-secret.
 */
const GIT_CONFIG_FAMILY_NAME_PATTERN = /^GIT_CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+)$/i;
const SAFE_ENV_NAME_PATTERNS: readonly RegExp[] = [GIT_CONFIG_FAMILY_NAME_PATTERN];

/** Matches just the `GIT_CONFIG_VALUE_<n>` half of the tuple, to scan for a secret-shaped value. */
const GIT_CONFIG_VALUE_NAME_PATTERN = /^GIT_CONFIG_VALUE_\d+$/i;

/**
 * Matches connection-string *values* with embedded `user:password@` userinfo
 * for common database schemes — e.g. `DATABASE_URL=postgres://user:pass@host/db`.
 * The var name (`DATABASE_URL`, `REDIS_URL`, ...) doesn't look secret-shaped
 * by itself, so this checks the value directly. Same scheme list this repo
 * already treats as sensitive in `logging/redaction.ts`.
 */
const CREDENTIAL_URL_VALUE_PATTERN =
  /^(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|rediss?):\/\/[^:\s"'/@]*:[^@\s"']+@/i;

/**
 * Matches values shaped like a raw `Authorization`/`Proxy-Authorization`
 * HTTP header. Needed because `GIT_CONFIG_KEY_<n>`/`VALUE_<n>` (see
 * `SAFE_ENV_NAME_PATTERNS` below) is git's genuine indexed config-injection
 * mechanism and its `GIT_CONFIG_VALUE_<n>` name is exempt by shape — but git
 * supports `http.extraHeader`, so an attacker- or config-controlled tuple
 * could set `GIT_CONFIG_KEY_0=http.extraHeader` /
 * `GIT_CONFIG_VALUE_0=Authorization: Bearer <token>` to smuggle a live
 * credential through under a name the filter otherwise trusts. The name
 * exemption only bypasses `isSecretEnvVarName` — `filterSecretEnvVars` still
 * runs `isSecretEnvVarValue` on every var regardless of its name, so this
 * catches it independent of what the var happens to be called.
 */
const AUTH_HEADER_VALUE_PATTERN = /^(?:authorization|proxy-authorization)\s*:\s*\S+/i;

/** Matches a bare `Bearer <token>` / `Basic <token>` value (no header name prefix). */
const BEARER_TOKEN_VALUE_PATTERN = /^(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}$/i;

/**
 * Matches a raw JWT value (three base64url segments joined by `.`) — e.g. CI
 * systems commonly export a live credential under a name with no secret-shaped
 * segment, like `CI_JOB_JWT`/`CI_JOB_JWT_V2`. Same three-segment shape this
 * repo already treats as sensitive in `issues/issue-runner.ts`.
 */
const JWT_VALUE_PATTERN = /^[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}$/;

/** True if an env var name matches a common secret-name pattern (*_KEY, *_TOKEN, *_SECRET, etc.). */
export function isSecretEnvVarName(name: string): boolean {
  if (SAFE_ENV_NAME_EXCEPTIONS.has(name.toUpperCase())) return false;
  if (SAFE_ENV_NAME_PATTERNS.some((pattern) => pattern.test(name))) return false;
  if (KNOWN_SECRET_ENV_NAMES.has(name.toUpperCase())) return true;
  if (SECRET_ENV_NAME_ADDITIONAL_PATTERNS.some((pattern) => pattern.test(name))) return true;
  return SECRET_ENV_NAME_PATTERN.test(name) || SECRET_ENV_NAME_COMPOUND_PATTERN.test(name);
}

/** True if an env var's *value* looks like a connection string, auth header, or raw JWT carrying embedded credentials. */
export function isSecretEnvVarValue(value: string): boolean {
  return CREDENTIAL_URL_VALUE_PATTERN.test(value)
    || AUTH_HEADER_VALUE_PATTERN.test(value)
    || BEARER_TOKEN_VALUE_PATTERN.test(value)
    || JWT_VALUE_PATTERN.test(value);
}

/**
 * Returns a copy of `env` with any secret-shaped keys (by name or, for
 * connection-string/auth-header values, by value) omitted, except for names
 * in `exemptNames` — used to let the actively selected provider's own
 * required auth var(s) (from `ICliProvider.requiredAuthEnvVars()`, e.g.
 * `ANTHROPIC_API_KEY` for `claude`, `OPENAI_API_KEY` for `codex`) survive
 * even though they are themselves secret-shaped: they're the CLI's own
 * designed auth channel, not an unrelated ambient secret leaking through.
 * Declaring this on the provider (rather than a lookup table keyed by name
 * here) means custom providers registered via `ProviderRegistry.register()`
 * can preserve their own credentials too.
 *
 * `exemptNames` matching follows the OS's own env var name semantics: exact
 * case on POSIX, where env var names are case-sensitive and a
 * differently-cased var of the same spelling is a genuinely distinct
 * variable the provider didn't declare; case-insensitive on Windows, where
 * env var names themselves are case-insensitive (`OpenAI_API_Key` and
 * `OPENAI_API_KEY` name the same variable, and the CLI would read either).
 */
export function filterSecretEnvVars(
  env: Record<string, string>,
  exemptNames?: readonly string[],
): Record<string, string> {
  const caseInsensitiveExempt = process.platform === 'win32';
  const normalize = (name: string): string => (caseInsensitiveExempt ? name.toUpperCase() : name);
  const exempt = new Set((exemptNames ?? []).map(normalize));

  // GIT_CONFIG_KEY_<n>/VALUE_<n>/COUNT is git's genuine indexed
  // config-injection mechanism (see SAFE_ENV_NAME_PATTERNS above) — but if
  // any GIT_CONFIG_VALUE_<n> turns out to be secret-shaped (e.g. a smuggled
  // Authorization header), dropping only that VALUE_<n> leaves a malformed
  // tuple (COUNT and KEY_<n> present, VALUE_<n> missing) that makes git
  // itself error out ("missing config value") on every command the CLI
  // runs. Drop the whole GIT_CONFIG_* family atomically instead, so git
  // simply doesn't see the mechanism at all rather than seeing it broken.
  const dropGitConfigFamily = Object.entries(env).some(
    ([key, value]) => GIT_CONFIG_VALUE_NAME_PATTERN.test(key) && isSecretEnvVarValue(value),
  );

  const filtered: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (dropGitConfigFamily && GIT_CONFIG_FAMILY_NAME_PATTERN.test(key)) continue;
    if (exempt.has(normalize(key))) {
      filtered[key] = value;
      continue;
    }
    if (isSecretEnvVarName(key) || isSecretEnvVarValue(value)) continue;
    filtered[key] = value;
  }
  return filtered;
}
