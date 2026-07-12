#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: scripts/create-project.sh <example-name> [target-directory]

Copies examples/<example-name> into a fresh target directory, copies
.env.example to .env when present, then runs npm ci in the target.

Examples:
  scripts/create-project.sh quick-start
  scripts/create-project.sh quick-start ../my-frankenbeast-app
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

example_name="${1:-}"
if [[ -z "$example_name" ]]; then
  usage >&2
  exit 64
fi

if [[ ! "$example_name" =~ ^[A-Za-z0-9._-]+$ || "$example_name" == "." || "$example_name" == ".." ]]; then
  printf 'Invalid example name: %s\n' "$example_name" >&2
  printf 'Example names may only contain letters, numbers, dots, underscores, and hyphens, and may not be . or ..\n' >&2
  exit 64
fi

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/.." && pwd)"
example_dir="$repo_root/examples/$example_name"

if [[ ! -d "$example_dir" ]]; then
  printf 'Unknown example: %s\n' "$example_name" >&2
  printf 'Available examples:\n' >&2
  if [[ -d "$repo_root/examples" ]]; then
    available_examples=()
    while IFS= read -r available_example; do
      available_examples+=("$available_example")
    done < <(
      for example_path in "$repo_root/examples"/*; do
        [[ -d "$example_path" ]] || continue
        basename -- "$example_path"
      done | sort
    )

    if (( ${#available_examples[@]} > 0 )); then
      printf '  %s\n' "${available_examples[@]}" >&2
    else
      printf '  (none)\n' >&2
    fi
  else
    printf '  (none)\n' >&2
  fi
  exit 66
fi

target_arg="${2:-$example_name-project}"
if [[ "$target_arg" = /* ]]; then
  target_dir="$target_arg"
else
  target_dir="$PWD/$target_arg"
fi

if [[ -e "$target_dir" ]]; then
  if [[ ! -d "$target_dir" ]]; then
    printf 'Target exists and is not a directory: %s\n' "$target_dir" >&2
    exit 73
  fi
  if [[ -n "$(find "$target_dir"/. -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
    printf 'Target directory is not empty: %s\n' "$target_dir" >&2
    exit 73
  fi
fi

mkdir -p "$target_dir"
cp -R "$example_dir"/. "$target_dir"/

if [[ -f "$target_dir/.env.example" && ! -e "$target_dir/.env" ]]; then
  cp "$target_dir/.env.example" "$target_dir/.env"
fi

if [[ ! -f "$target_dir/package-lock.json" ]]; then
  printf 'Example %s does not include package-lock.json; cannot run npm ci.\n' "$example_name" >&2
  exit 78
fi

(
  cd "$target_dir"
  npm ci
)

cat <<EOF
Created Frankenbeast example project
  Example: $example_name
  Target:  $target_dir
  Env:     $([[ -f "$target_dir/.env" ]] && printf '.env created' || printf 'no .env.example present')

Next steps:
  cd "$target_dir"
  npm start
EOF
