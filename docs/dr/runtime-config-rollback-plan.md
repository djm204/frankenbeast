# Runtime config rollback plan generator

Use the runtime config rollback plan generator when a persistent Beast/runtime config change causes a failed launch, degraded behavior, or ambiguous rollback handoff. The helper compares a last-known-good JSON runtime config snapshot with the changed snapshot and prints a dry-run plan that operators can review before restoring the old config. It is a live-target rollback helper: point `--target` at the persistent config file that the next run will read, not an ephemeral `.fbeast/.build/run-configs/...` launch snapshot that may be cleaned up after process exit.

The helper is intentionally conservative:

- it only accepts JSON object snapshots;
- it enforces the same 1 MiB/depth/container safety budget as the runtime config loader;
- it rejects no-op comparisons so operators do not approve an empty rollback;
- it prints deterministic JSON-pointer changed paths;
- it JSON-encodes changed paths in Markdown so unusual config keys cannot forge headings or command bullets;
- it redacts changed values from machine-readable plan output and evidence commands;
- it rejects control characters in rendered file paths;
- it never writes the target runtime config itself;
- the default evidence directory is deterministic but unique per target path;
- captured evidence commands reject symlinked evidence paths and leaf files, use private directory/file modes (`0700`/`0600`), and pin before/after snapshot digests before approval;
- the actual restore command is routed through `approval-cop` or an equivalent HITL wrapper.

## Generate a plan

```bash
npm run dr:runtime-config-rollback:dry-run -- \
  --before snapshots/runtime.before.json \
  --after snapshots/runtime.after.json \
  --target config/runtime.json
```

For automation, request structured output:

```bash
npm run dr:runtime-config-rollback:dry-run -- \
  --format json \
  --before snapshots/runtime.before.json \
  --after snapshots/runtime.after.json \
  --target config/runtime.json
```

## Operator interpretation

The plan has four sections:

1. `Capture read-only rollback evidence` — refuse symlinked evidence path components, create the evidence directory, force it to `0700`, copy the before/after snapshots into it without following symlinked leaf files, and write deterministic value-redacted change metadata with `0600` permissions.
2. `Operator decisions before rollback` — confirm the before snapshot is the intended last-known-good state and the changed paths match the incident.
3. `Approval-gated rollback action` — the single `approval-cop run -- node ...` command that refuses symlinked target paths, verifies the captured before/after snapshot digests still match the reviewed files, checks that the target still matches the captured immutable after snapshot under the evidence directory, and then restores the before snapshot to the target config.
4. `Verify rollback` — compare the restored target with the rollback snapshot and parse both JSON files before resuming the affected runtime.

Do not run the approval-gated copy until the evidence is captured and the changed paths are reviewed. After approval-cop restores the config, rerun the affected Beast/runtime launch path and record the verification result in the generated `rollback-comment.md` before posting it to a PR, incident record, or Kanban card.

## Failure modes

- Invalid JSON or a non-object snapshot fails before a plan is printed.
- Snapshots larger than 1 MiB, deeper than 64 containers, or exceeding the configured container/key/item budgets fail before a plan is printed.
- Matching before/after snapshots fail with `No runtime config changes detected`.
- Paths starting with `-` or containing control characters are rejected so generated argv and Markdown cannot be interpreted as options or forged plan text.
