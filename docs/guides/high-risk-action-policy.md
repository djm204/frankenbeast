# High-risk action policy

`@franken/governor` exposes a small policy-as-code boundary for agent actions whose side effects must be deliberate and reviewable. Use `evaluateHighRiskActionPolicy()` before executing or dispatching high-risk actions instead of adding ad-hoc string checks in wrappers.

## Covered action classes

The policy module currently covers:

- `git-remote-write` — pushes, force pushes, branch deletes, or other remote ref mutations.
- `github-mutation` — issue, PR, label, review, check, workflow, or repository-setting changes through GitHub APIs/CLI.
- `cron` — creating, updating, pausing, resuming, removing, or manually running durable scheduled jobs.
- `memory` — durable user/profile memory mutations.
- `profile-write` — writes to profile-owned skills, plugins, cron, memory/config, or credentials.
- `webhook` — outbound webhook sends.
- `shell-process-control` — commands that start, stop, kill, or otherwise control local processes or shell execution.

Each evaluation returns:

- `decision`: `allow`, `deny`, or `needs-approval`.
- `reason`: a human-readable reason suitable for audit logs and approval prompts.
- `evidence`: the normalized facts used for the decision, such as target, operation, command, profile, URL, allowlist status, or dry-run/read-only flags.

## Adding or changing a rule safely

1. Add the action class to `HIGH_RISK_ACTION_CLASSES` only when the class is stable and reviewable.
2. Add a rule that fails closed when required evidence is missing.
3. Prefer `allow` only for read-only or dry-run operations with no side effects.
4. Return `deny` for malformed, cross-profile, unallowlisted, or ambiguous requests.
5. Return `needs-approval` for valid side-effecting actions that an operator may approve.
6. Add tests for allowed, denied, and approval-required cases for the action class.
7. Export the helper only through `@franken/governor` so callers consume the same policy boundary.

## Example

```ts
import { evaluateHighRiskActionPolicy } from '@franken/governor';

const decision = evaluateHighRiskActionPolicy({
  actionClass: 'git-remote-write',
  evidence: {
    command: 'git push --force-with-lease origin HEAD:main',
    target: 'origin main',
    force: true,
  },
});

if (decision.decision === 'deny') throw new Error(decision.reason);
if (decision.decision === 'needs-approval') {
  // Route `decision.reason` and `decision.evidence` through the approval gateway.
}
```
