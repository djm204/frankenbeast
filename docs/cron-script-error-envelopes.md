# Cron script error envelopes

Use `scripts/run-cron-script.mjs` when a scheduled or cron-owned command needs machine-readable failure output for coordination/liveness tooling.

```bash
node scripts/run-cron-script.mjs --name nightly-smoke -- npm run test:root -- tests/unit/cron-script-error-envelope.test.ts
```

When the wrapped command exits successfully, the wrapper exits `0` and does not add extra output. If the command line includes `--dangerously-skip-permissions`, the wrapper refuses to start it unless the cron entry also includes the explicit wrapper opt-in `--allow-dangerous-skip-permissions` before the `--` command separator. That opt-in is the audit-visible record that this scheduled job intentionally runs in dangerous permission-bypass mode; use it only after documenting the job's trust boundary and blast radius.

When the command fails to start, exits non-zero, receives a signal, is blocked by the dangerous-permissions gate, or the wrapper is invoked incorrectly, it writes one JSON object to stderr:

```json
{
  "schemaVersion": 1,
  "type": "franken.cron.script.error",
  "timestamp": "2026-07-15T00:00:00.000Z",
  "script": "nightly-smoke",
  "command": ["npm", "run", "test:root", "--", "tests/unit/cron-script-error-envelope.test.ts"],
  "failureKind": "exit",
  "exitCode": 1,
  "signal": null,
  "permissionMode": "least-privilege",
  "durationMs": 1234,
  "recoverable": false,
  "message": "cron script exited with code 1",
  "stderrTail": "...last stderr bytes..."
}
```

Fields operators should key on:

- `type`: stable discriminator for log parsers and liveness monitors.
- `script`: cron job name supplied by `--name`; keep it stable across schedule changes.
- `failureKind`: `usage`, `security`, `spawn`, `exit`, `signal`, or `internal`.
- `exitCode` and `signal`: process outcome suitable for alert routing.
- `permissionMode`: `least-privilege` by default, or `dangerous-skip-permissions` when the cron command intentionally includes `--dangerously-skip-permissions` with the matching wrapper opt-in.
- `stderrTail`: capped to the last 4096 characters so alerts stay useful without dumping full logs.
- `recoverable`: opt-in operator hint; pass `--recoverable` for transient jobs where retrying later is expected.

For usage/configuration errors, the wrapper also emits the envelope and exits `2`, making missing command separators (`--`) and malformed cron definitions explicit instead of silent scheduler drift.
