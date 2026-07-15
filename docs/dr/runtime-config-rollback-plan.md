# Runtime config rollback plan generator

Use the runtime config rollback plan generator when a Beast/runtime config change causes a failed launch, degraded behavior, or ambiguous rollback handoff. The helper compares a last-known-good JSON runtime config snapshot with the changed snapshot and prints a dry-run plan that operators can review before restoring the old config.

The helper is intentionally conservative:

- it only accepts JSON object snapshots;
- it rejects no-op comparisons so operators do not approve an empty rollback;
- it prints deterministic JSON-pointer changed paths;
- it never writes the target runtime config itself;
- the actual restore command is routed through `approval-cop` or an equivalent HITL wrapper.

## Generate a plan

```bash
npm run dr:runtime-config-rollback:dry-run -- \
  --before .fbeast/.build/run-configs/run-123.before.json \
  --after .fbeast/.build/run-configs/run-123.after.json \
  --target .fbeast/.build/run-configs/run-123.json \
  --evidence-dir rollback-evidence/runtime-run-123
```

For automation, request structured output:

```bash
npm run dr:runtime-config-rollback:dry-run -- \
  --format json \
  --before snapshots/run-123.before.json \
  --after snapshots/run-123.after.json \
  --target .fbeast/.build/run-configs/run-123.json
```

## Operator interpretation

The plan has four sections:

1. `Capture read-only rollback evidence` — copy the before snapshot into the evidence directory and write deterministic change metadata.
2. `Operator decisions before rollback` — confirm the before snapshot is the intended last-known-good state and the changed paths match the incident.
3. `Approval-gated rollback action` — the single `approval-cop run -- cp ...` command that restores the before snapshot to the target config.
4. `Verify rollback` — compare the restored target with the rollback snapshot and parse both JSON files before resuming the affected runtime.

Do not run the approval-gated copy until the evidence is captured and the changed paths are reviewed. After approval-cop restores the config, rerun the affected Beast/runtime launch path and record the verification result in the generated `rollback-comment.md` before posting it to a PR, incident record, or Kanban card.

## Failure modes

- Invalid JSON or a non-object snapshot fails before a plan is printed.
- Matching before/after snapshots fail with `No runtime config changes detected`.
- Paths starting with `-` or containing NUL are rejected so generated argv commands cannot be interpreted as options.
