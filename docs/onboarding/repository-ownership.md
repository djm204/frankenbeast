# Repository ownership manifest

Frankenbeast keeps a structured repository ownership manifest at `docs/onboarding/repository-ownership.manifest.json`. Use it before assigning repository-wide or cross-package work so coordinators, workers, and reviewers can route changes to the right maintainer surface without rediscovering package boundaries.

## How to use the manifest

1. Match every touched path against the manifest `entries[].paths` globs.
2. Put the matching `id`, `primaryOwner`, and `escalationOwner` in the issue, PR, or Kanban handoff.
3. Run the listed `verification` commands when the touched area is in scope, or explain why a narrower command is safer.
4. Include the `handoffNotes` when creating worker prompts so agents know the local pitfalls for that ownership area.

## Coordinator/worker handoff

Use this compact shape in issue and PR handoffs:

```text
Ownership entries: orchestrator-runtime, repo-automation
Primary owners: orchestrator-maintainers, repo-automation-maintainers
Escalation owner: core-maintainers
Verification: npm test --workspace @franken/orchestrator; npm run test:root
Notes: touches HTTP runtime and root CI guardrails; verify both package behavior and workflow metadata tests.
```

If a change spans multiple owners, list every touched manifest entry and do not collapse the work to the first path that matched. Cross-package contract changes usually include both the package owner and `types-contracts`.

## Unknown or cross-cutting paths

Do not guess an owner from package names alone. For unknown paths, first read `docs/CONTRACT_MATRIX.md`, `docs/onboarding/RAMP_UP.md`, and nearby package READMEs, then assign `core-maintainers` as the default escalation owner until the manifest is updated.

Negative/edge cases:

- Do not assign browser work to `orchestrator-runtime` just because the browser calls an orchestrator route; include both `web-dashboard` and `orchestrator-runtime` when both sides change.
- Do not assign shared DTO or export changes only to the consuming package; include `types-contracts` when `packages/franken-types/**` changes.
- Do not treat historical `docs/plans/**` ownership as live runtime ownership without verifying current package boundaries.
- Do not broaden a one-issue worker into adjacent owners just because the manifest names them; open a follow-up or coordinator routing decision instead.

## Maintaining the manifest

When repository structure changes, update `docs/onboarding/repository-ownership.manifest.json` and this guide in the same PR. Keep entries deterministic and LLM-friendly: stable lowercase ids, explicit path globs, a primary owner, an escalation owner, responsibilities, verification commands, and handoff notes.
