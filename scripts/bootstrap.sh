#!/usr/bin/env bash
set -euo pipefail

DRY_RUN=0
START_DOCKER=0
PROMPT_DOCKER=1
ASSUME_YES=0
ONBOARDING_TOTAL_STEPS=6
ONBOARDING_STEP=0
ONBOARDING_STAGE=args

usage() {
  cat <<'USAGE'
Usage: scripts/bootstrap.sh [--dry-run] [--services|--with-docker|--no-docker] [--yes]

Bootstraps a Frankenbeast checkout for local development:
  1. validates Node.js, npm, and Corepack prerequisites;
  2. activates the repository-pinned npm version;
  3. creates .env from .env.example when missing;
  4. merges documented default env vars into existing .env files without clobbering local secrets;
  5. runs npm ci;
  6. optionally validates Grafana credentials and starts docker compose services.

Options:
  --dry-run       Validate prerequisites and planned actions without mutating files,
                  installing packages, or starting Docker.
  --services      Alias for --with-docker; start docker compose services after npm ci.
  --with-docker   Start docker compose services after npm ci.
  --no-docker     Skip docker compose without prompting.
  --yes           Accept defaults for prompts; currently skips optional Docker.
  -h, --help      Show this help.
USAGE
}

log() { printf '[bootstrap] %s\n' "$*"; }
status() {
  local state="$1"
  local label="$2"
  shift 2
  printf '[onboarding:%s/%s:%s] %s' "$ONBOARDING_STEP" "$ONBOARDING_TOTAL_STEPS" "$label" "$state"
  if [[ "$#" -gt 0 ]]; then
    printf ' - %s' "$*"
  fi
  printf '\n'
}
step() {
  ONBOARDING_STEP=$((ONBOARDING_STEP + 1))
  ONBOARDING_STAGE="$1"
  status start "$1" "$2"
}
fail() {
  status error "$ONBOARDING_STAGE" "$*" >&2
  printf '[bootstrap] ERROR: %s\n' "$*" >&2
  exit 1
}
run() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "dry-run: $*"
  else
    "$@" || fail "Command failed: $*"
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --services|--with-docker) START_DOCKER=1; PROMPT_DOCKER=0 ;;
    --no-docker) START_DOCKER=0; PROMPT_DOCKER=0 ;;
    --yes|-y) ASSUME_YES=1 ;;
    -h|--help) usage; exit 0 ;;
    *) fail "Unknown argument: $1" ;;
  esac
  shift
done

cd "$(dirname "$0")/.."

step prerequisites "checking Node.js, npm, and Corepack"
command -v node >/dev/null 2>&1 || fail "Node.js is required. Install Node.js >=22.13.0 <23 or >=24.0.0 <26."
command -v npm >/dev/null 2>&1 || fail "npm is required. Enable Corepack and activate the repository packageManager pin."
command -v corepack >/dev/null 2>&1 || fail "Corepack is required. Install it with: npm install -g corepack"

if ! node <<'NODE'
const version = process.versions.node.split('.').map(Number);
const [major, minor, patch] = version;
const ok = (major === 22 && (minor > 13 || (minor === 13 && patch >= 0))) || (major >= 24 && major < 26);
if (!ok) {
  console.error(`[bootstrap] ERROR: Node.js ${process.version} is unsupported. Expected >=22.13.0 <23 or >=24.0.0 <26.`);
  process.exit(1);
}
NODE
then
  fail "Node.js is outside the supported range. Install Node.js >=22.13.0 <23 or >=24.0.0 <26."
fi
status ok prerequisites "Node.js $(node --version) satisfies the repository engine range"

step package-manager "activating pinned npm version"
expected_pm="$(node -p "require('./package.json').packageManager")"
expected_npm="${expected_pm#npm@}"
actual_npm="$(npm --version)"
package_manager_status="npm $actual_npm matches $expected_pm"
if [[ "$actual_npm" != "$expected_npm" ]]; then
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "dry-run: npm $actual_npm does not match packageManager $expected_pm; a real bootstrap would run corepack prepare \"$expected_pm\" --activate and corepack enable npm"
    package_manager_status="npm $actual_npm would be changed to $expected_pm by Corepack"
  else
    log "Activating repository package manager pin $expected_pm with Corepack."
    run corepack prepare "$expected_pm" --activate
    run corepack enable npm
    actual_npm="$(npm --version)"
    [[ "$actual_npm" == "$expected_npm" ]] || fail "npm $actual_npm does not match packageManager $expected_pm after Corepack activation."
    package_manager_status="npm $actual_npm matches $expected_pm"
    log "npm $actual_npm matches packageManager $expected_pm."
  fi
else
  log "npm $actual_npm matches packageManager $expected_pm."
fi
status ok package-manager "$package_manager_status"

step env-file "creating or validating local environment defaults"
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

# Merge uncommented defaults from .env.example into existing local .env files
# without overwriting provider keys, local secrets, or operator overrides.
default_keys="$({ grep -E '^[A-Za-z_][A-Za-z0-9_]*=' .env.example || true; } | cut -d= -f1)"
if [[ -n "$default_keys" && -f .env ]]; then
  defaults_to_add=()
  while IFS= read -r key; do
    [[ -n "$key" ]] || continue
    if ! grep -Eq "^${key}=" .env; then
      defaults_to_add+=("$(grep -E "^${key}=" .env.example | tail -n 1)")
    fi
  done <<< "$default_keys"

  if [[ "${#defaults_to_add[@]}" -gt 0 ]]; then
    if [[ "$DRY_RUN" -eq 1 ]]; then
      log "dry-run: would append missing .env defaults: ${defaults_to_add[*]%%=*}"
    else
      {
        printf '\n# Defaults appended by scripts/bootstrap.sh\n'
        printf '%s\n' "${defaults_to_add[@]}"
      } >> .env
      log "Appended missing documented defaults to .env."
    fi
  else
    log ".env includes documented defaults."
  fi
fi
status ok env-file "local environment defaults are present or planned"

step docker "evaluating optional Docker services"
if [[ "$PROMPT_DOCKER" -eq 1 && "$ASSUME_YES" -eq 0 && "$DRY_RUN" -eq 0 && -t 0 ]]; then
  read -r -p "Start optional Docker compose services now? [y/N] " docker_answer
  case "$docker_answer" in
    y|Y|yes|YES) START_DOCKER=1 ;;
    *) START_DOCKER=0 ;;
  esac
fi

if [[ "$START_DOCKER" -eq 1 ]]; then
  env_value() {
    local key="$1"
    [[ -f .env ]] || return 0
    { grep -E "^${key}=" .env || true; } | tail -n 1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/'
  }
  grafana_user="$(env_value GRAFANA_USER)"
  grafana_password="$(env_value GRAFANA_PASSWORD)"
  if [[ -f .env && ( -z "$grafana_user" || -z "$grafana_password" || "$grafana_password" == "admin" || "$grafana_password" == "change-me-random-grafana-password" ) ]]; then
    fail "--services/--with-docker requires GRAFANA_USER=admin and a unique non-default GRAFANA_PASSWORD in .env before starting Grafana."
  fi
  if [[ -f .env ]]; then
    [[ "$grafana_user" == "admin" ]] || fail "docker-compose.yml requires GRAFANA_USER=admin for the local Grafana service."
  fi
  if [[ "$DRY_RUN" -eq 0 ]]; then
    command -v docker >/dev/null 2>&1 || fail "Docker is required for --services/--with-docker. Install Docker or rerun with --no-docker."
  fi
fi
if [[ "$START_DOCKER" -eq 1 ]]; then
  status ok docker "optional services enabled"
else
  status ok docker "optional services skipped"
fi

step dependencies "installing workspace dependencies"
run npm ci
status ok dependencies "npm dependencies installed or dry-run planned"

step services "starting requested optional services"
if [[ "$START_DOCKER" -eq 1 ]]; then
  run docker compose up -d
else
  log "Skipping optional Docker compose services. Use --services or --with-docker to start them."
fi
if [[ "$START_DOCKER" -eq 1 ]]; then
  status ok services "optional services started or dry-run planned"
else
  status ok services "optional services intentionally skipped"
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
  log "Bootstrap dry-run completed successfully."
else
  log "Bootstrap completed successfully."
fi
status complete done "onboarding bootstrap reached $ONBOARDING_TOTAL_STEPS/$ONBOARDING_TOTAL_STEPS steps"
