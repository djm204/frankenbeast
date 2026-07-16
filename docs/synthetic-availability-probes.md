# Synthetic Availability Probes

`scripts/synthetic-availability-probes.mjs` runs a read-only synthetic uptime suite for critical Frankenbeast operator workflows. It is intended for CI, cron, and incident-status evidence when operators need to distinguish service-down conditions from workflow-broken conditions.

No probe mutates GitHub, Git, memory, or approval state. The suite only performs read-only issue listing, read-only Kanban SQLite inspection, a configured provider status command, an HTTP GET health check, and JSON parsing of the approval ledger.

## Workflows covered

| Probe | What it checks | Default remediation hint |
| --- | --- | --- |
| `github_issue_read` | `gh issue list --limit 1 --json number,title,state` can read the configured repository. | Check `gh auth`, GitHub API reachability, and repository access. |
| `kanban_read` | The configured Kanban SQLite DB can be opened read-only and queried. | Check the Kanban DB path and filesystem permissions. |
| `provider_status` | A configured non-mutating provider command exits successfully. | Check provider CLI installation/authentication or set `FRANKENBEAST_AVAILABILITY_PROVIDER_COMMAND`. |
| `dashboard_health` | The configured dashboard health URL returns a 2xx response. | Start the dashboard/chat server or update the URL. |
| `approval_ledger_parse` | The configured approval ledger file is readable JSON. | Check ledger path, JSON validity, and permissions. |

Each result includes:

- `status`: `healthy` or `unavailable`
- `latencyMs`
- `timeoutMs`
- `remediationHint`
- optional `detail` or `error`

## JSON usage for CI

```bash
node scripts/synthetic-availability-probes.mjs --json \
  --repo djm204/frankenbeast \
  --kanban-db "$HERMES_KANBAN_DB" \
  --provider-command "your-provider-health-command --json" \
  --dashboard-url http://127.0.0.1:3737/health \
  --approval-ledger .fbeast/approvals/ledger.json
```

The process exits `0` when all probes are healthy, `1` when any probe is unavailable, and `2` for invalid CLI/configuration errors. `--json` emits one compact JSON object per run so CI and cron can append it to JSONL logs; use `--pretty-json` only for interactive human inspection.

## Cron usage

Example cron entry that runs every five minutes and appends JSON evidence:

```cron
*/5 * * * * cd /srv/frankenbeast && node scripts/synthetic-availability-probes.mjs --json --repo djm204/frankenbeast --kanban-db /var/lib/hermes/kanban.db --provider-command "your-provider-health-command --json" --dashboard-url http://127.0.0.1:3737/health --approval-ledger /var/lib/hermes/approvals/ledger.json >> /var/log/frankenbeast-availability-probes.jsonl 2>&1
```

Environment variable equivalents are available for schedulers that prefer static commands:

- `FRANKENBEAST_AVAILABILITY_REPO`
- `FRANKENBEAST_AVAILABILITY_KANBAN_DB` or `HERMES_KANBAN_DB`
- `FRANKENBEAST_AVAILABILITY_PROVIDER_COMMAND` (shell-style quoted argv is supported, for example `node -e "process.exit(0)"`)
- `FRANKENBEAST_AVAILABILITY_DASHBOARD_URL`
- `FRANKENBEAST_AVAILABILITY_APPROVAL_LEDGER`

Use the text format for human status snippets:

```bash
node scripts/synthetic-availability-probes.mjs --text \
  --repo djm204/frankenbeast \
  --kanban-db "$HERMES_KANBAN_DB" \
  --provider-command "your-provider-health-command --json" \
  --dashboard-url http://127.0.0.1:3737/health \
  --approval-ledger .fbeast/approvals/ledger.json
```
