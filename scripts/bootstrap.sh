#!/usr/bin/env bash
set -euo pipefail

DRY_RUN=0
START_DOCKER=0
PROMPT_DOCKER=1
ASSUME_YES=0

usage() {
  cat <<'USAGE'
Usage: scripts/bootstrap.sh [--dry-run] [--with-docker|--no-docker] [--yes]

Bootstraps a Frankenbeast checkout for local development:
  1. validates Node.js, npm, and Corepack prerequisites;
  2. activates the repository-pinned npm version;
  3. creates .env from .env.example when missing;
  4. prompts for any required env vars that are blank;
  5. runs npm ci;
  6. optionally starts docker compose services;
  7. validates required env vars before exiting.

Options:
  --dry-run       Validate prerequisites and planned actions without mutating files,
                  installing packages, or starting Docker.
  --with-docker   Start docker compose services after npm ci.
  --no-docker     Skip docker compose without prompting.
  --yes           Accept defaults for prompts; currently skips optional Docker.
  -h, --help      Show this help.
USAGE
}

log() { printf '[bootstrap] %s\n' "$*"; }
fail() { printf '[bootstrap] ERROR: %s\n' "$*" >&2; exit 1; }
run() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "dry-run: $*"
  else
    "$@"
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --with-docker) START_DOCKER=1; PROMPT_DOCKER=0 ;;
    --no-docker) START_DOCKER=0; PROMPT_DOCKER=0 ;;
    --yes|-y) ASSUME_YES=1 ;;
    -h|--help) usage; exit 0 ;;
    *) fail "Unknown argument: $1" ;;
  esac
  shift
done

cd "$(dirname "$0")/.."

command -v node >/dev/null 2>&1 || fail "Node.js is required. Install Node.js >=22.13.0 <23 or >=24.0.0 <26."
command -v npm >/dev/null 2>&1 || fail "npm is required. Enable Corepack and activate the repository packageManager pin."
command -v corepack >/dev/null 2>&1 || fail "Corepack is required. Install it with: npm install -g corepack"

node <<'NODE'
const version = process.versions.node.split('.').map(Number);
const [major, minor, patch] = version;
const ok = (major === 22 && (minor > 13 || (minor === 13 && patch >= 0))) || (major >= 24 && major < 26);
if (!ok) {
  console.error(`[bootstrap] ERROR: Node.js ${process.version} is unsupported. Expected >=22.13.0 <23 or >=24.0.0 <26.`);
  process.exit(1);
}
NODE
log "Node.js $(node --version) satisfies the repository engine range."

expected_pm="$(node -p "require('./package.json').packageManager")"
expected_npm="${expected_pm#npm@}"
actual_npm="$(npm --version)"
if [[ "$actual_npm" != "$expected_npm" ]]; then
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "dry-run: npm $actual_npm does not match packageManager $expected_pm; would run corepack enable npm and corepack prepare \"$expected_pm\" --activate"
  else
    log "Activating repository package manager pin $expected_pm with Corepack."
    corepack enable npm
    corepack prepare "$expected_pm" --activate
    actual_npm="$(npm --version)"
    [[ "$actual_npm" == "$expected_npm" ]] || fail "npm $actual_npm does not match packageManager $expected_pm after Corepack activation."
  fi
fi
log "npm $actual_npm matches packageManager $expected_pm."

[[ -f .env.example ]] || fail ".env.example is missing; cannot bootstrap local environment."
if [[ ! -f .env ]]; then
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "dry-run: would copy .env.example to .env"
  else
    cp .env.example .env
    log "Created .env from .env.example."
  fi
else
  log ".env already exists; leaving it unchanged."
fi

# Required keys are the uncommented KEY=VALUE assignments in .env.example. Most
# provider keys are intentionally commented because they are only required for
# specific provider paths.
required_keys="$({ grep -E '^[A-Za-z_][A-Za-z0-9_]*=' .env.example || true; } | cut -d= -f1)"
missing_keys=()
blank_keys=()
if [[ -n "$required_keys" ]]; then
  source_file=.env
  [[ -f "$source_file" ]] || source_file=.env.example
  while IFS= read -r key; do
    [[ -n "$key" ]] || continue
    if ! grep -Eq "^${key}=" "$source_file"; then
      missing_keys+=("$key")
      continue
    fi
    value="$(grep -E "^${key}=" "$source_file" | tail -n 1 | cut -d= -f2-)"
    if [[ -z "$value" ]]; then
      blank_keys+=("$key")
    fi
  done <<< "$required_keys"
fi

if [[ "${#missing_keys[@]}" -gt 0 || "${#blank_keys[@]}" -gt 0 ]]; then
  if [[ "$DRY_RUN" -eq 1 ]]; then
    fail "Required env vars are missing or blank: ${missing_keys[*]} ${blank_keys[*]}. Copy .env.example to .env and fill them in."
  fi
  if [[ -t 0 ]]; then
    for key in "${missing_keys[@]}" "${blank_keys[@]}"; do
      [[ -n "$key" ]] || continue
      read -r -p "Enter value for required env var $key: " value
      [[ -n "$value" ]] || fail "$key cannot be blank."
      if grep -Eq "^${key}=" .env; then
        tmp="$(mktemp)"
        awk -v k="$key" -v v="$value" 'BEGIN{done=0} $0 ~ "^" k "=" {$0=k "=" v; done=1} {print} END{if(!done) print k "=" v}' .env > "$tmp"
        mv "$tmp" .env
      else
        printf '%s=%s\n' "$key" "$value" >> .env
      fi
    done
  else
    fail "Required env vars are missing or blank: ${missing_keys[*]} ${blank_keys[*]}. Edit .env and rerun."
  fi
fi
log "Required env vars are present."

run npm ci

if [[ "$PROMPT_DOCKER" -eq 1 && "$ASSUME_YES" -eq 0 && "$DRY_RUN" -eq 0 && -t 0 ]]; then
  read -r -p "Start optional Docker compose services now? [y/N] " docker_answer
  case "$docker_answer" in
    y|Y|yes|YES) START_DOCKER=1 ;;
    *) START_DOCKER=0 ;;
  esac
fi

if [[ "$START_DOCKER" -eq 1 ]]; then
  command -v docker >/dev/null 2>&1 || fail "Docker is required for --with-docker. Install Docker or rerun with --no-docker."
  run docker compose up -d
else
  log "Skipping optional Docker compose services. Use --with-docker to start them."
fi

log "Bootstrap ${DRY_RUN:+dry-run }completed successfully."
