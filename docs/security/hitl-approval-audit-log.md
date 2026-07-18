# HITL approval audit log

The websocket chat approval path writes an append-only JSONL audit log for human-in-the-loop approval decisions and approved-command execution results.

Default storage path:

```text
.fbeast/audit/hitl-approval-audit.jsonl
```

Each line is one audit entry with:

- `entryId` and `timestamp`
- `sessionId` and `projectId`
- `token` for the consumed approval, generated from the pending approval token when present or from session/request timestamp/command hash
- `workerId`, `workdir`, and `requester` provenance when available
- `decisionSource` (`human`, `runtime`, `parser`, or `audit-log`)
- `decision` (`approved`, `denied`, `executed`, `failed`, `skipped`, or `replayed`)
- `commandHash` and `commandBody`
- `exitCode`, `outputTail`, or `reason` when applicable

Replay handling:

Before an approved pending command is executed, the controller checks the durable audit log for an existing `executed` or `failed` entry with the same session, project, token, and command hash. A match is treated as a consumed approval: the controller records a `replayed` entry, refuses to execute the command again, and requires a fresh approval request.

Operational notes:

- The log is append-only so incident review does not depend on chat/Discord history.
- Valid older lines are still read if a later partial/corrupt line exists after a crash.
- Audit write failures do not turn an already-valid human decision into a second prompt, but replay protection is available when the log can be read.
