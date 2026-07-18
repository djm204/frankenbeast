# Cron credential safety

Cron installers must not persist GitHub personal access tokens or other bearer credentials in crontab text. Crontabs are long-lived local state and are commonly exposed through operator tooling, host backups, debug bundles, and log collection.

## Required pattern

Prefer one of these mechanisms instead of embedding a token assignment in a cron entry:

1. Use `gh auth token` at runtime from a pre-authenticated GitHub CLI account.
2. Source a dedicated root- or operator-owned env file whose permissions are `0600`, and keep only the env file path in the crontab.
3. Use the platform credential helper or secret manager and fetch the credential inside the scheduled script.

Generated crontab lines may reference a script or an env file path, but they must not contain token material and must not interpolate values read from `GITHUB_PERSONAL_ACCESS_TOKEN`, `GITHUB_TOKEN`, or other sensitive environment variables.

## Migration and rotation guidance

If a legacy installer may have written a PAT into crontab text:

1. Inspect the current crontab with `crontab -l` and remove any inline token assignment.
2. Move required credentials to a restricted credential store or `0600` env file.
3. Rotate any GitHub credentials that appeared in crontab history, backups, terminal scrollback, or logs.
4. Reinstall the cron entry so the crontab contains only non-secret command text.

The repository security lint includes regression coverage for cron scripts that try to interpolate sensitive environment values into crontab commands.
