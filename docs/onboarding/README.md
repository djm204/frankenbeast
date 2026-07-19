---
title: Onboarding guide index
description: Choose the shortest Frankenbeast onboarding path for setup, contribution, agent work, architecture, testing, and operations.
---

# Onboarding guide index

Use this page when you know what you want to accomplish but do not know which onboarding document to open. Pick one row, follow its **start here** link, and branch into the supporting references only when the first guide tells you to.

For a complete clean-checkout setup, use the root [onboarding checklist](../../ONBOARDING.md). For the shortest role-based path, start with the [persona quickstart tracks](persona-quickstart-tracks.md). When you are ready to make a change, the root [Contributor guide](../../CONTRIBUTING.md) gives the complete issue-to-pull-request path for a first contribution.

## Choose by goal

| Goal | Start here | Continue with |
| --- | --- | --- |
| Run Frankenbeast locally | [Persona quickstart tracks](persona-quickstart-tracks.md) — Operator track | [Local service dependencies](local-service-dependencies.md), then the [setup troubleshooting matrix](setup-troubleshooting-matrix.md) if a check fails |
| Make a first code or docs contribution | [Persona quickstart tracks](persona-quickstart-tracks.md) — Contributor track | [Test command decision tree](test-command-decision-tree.md) |
| Make a documentation-only contribution | [Docs-only contribution quickstart](docs-only-contribution.md) | [Contributor guide](../../CONTRIBUTING.md) for the full code-and-docs workflow |
| Improve the browser dashboard UX | [Dashboard UX contribution checklist](dashboard-ux-contribution.md) | [Architecture map](architecture-map.md) and [test command decision tree](test-command-decision-tree.md) |
| Get help with a first-contribution blocker | [Getting help with a first contribution](getting-help.md) | The setup, testing, security, and review references selected by that guide |
| Take one issue through a first PR | [First-PR agent runbook](first-pr-agent-runbook.md) | [Coding-agent PR etiquette](coding-agent-pr-etiquette.md) and the [issue complexity rubric](issue-complexity-rubric.md) |
| Practice before editing production code | [Sample agent practice issue](sample-agent-practice-issue.md) | The linked practice fixture and reset workflow |
| Find the package that owns a change | [Architecture map](architecture-map.md) | [Repository ownership](repository-ownership.md) |
| Assign or recover agent work | [Agent role responsibility map](agent-role-responsibility-map.md) | [Agent coordination runtime glossary](agent-coordination-runtime-glossary.md) |
| Understand merge, release, and deployment ownership | [Release and deployment mental model](release-deployment-mental-model.md) | The release and rollback references linked from that guide |

## All onboarding references

- [Agent coordination runtime glossary](agent-coordination-runtime-glossary.md) — terms used in Kanban, liveness, approval, and PR handoffs.
- [Agent role responsibility map](agent-role-responsibility-map.md) — boundaries and required evidence for coordinators, workers, reviewers, and repair owners.
- [Architecture map](architecture-map.md) — routes issue topics to current packages, tests, and safety boundaries.
- [Coding-agent PR etiquette](coding-agent-pr-etiquette.md) — one-issue PR scope, review gates, and blocked-work handoffs.
- [Dashboard UX contribution checklist](dashboard-ux-contribution.md) — reproducible UI changes, accessibility checks, package verification, and review evidence.
- [Docs-only contribution quickstart](docs-only-contribution.md) — low-overhead Markdown editing, preview, link checks, and PR evidence.
- [First-PR agent runbook](first-pr-agent-runbook.md) — end-to-end issue, branch, verification, PR, Codex, and merge flow.
- [Getting help with a first contribution](getting-help.md) — routes setup, scope, test, CI, review, and security blockers to the right channel with safe evidence.
- [Issue complexity rubric](issue-complexity-rubric.md) — assigns risk level, worker lane, and verification depth.
- [Local service dependencies](local-service-dependencies.md) — explains when ChromaDB, Grafana, Tempo, Docker, providers, and secret stores are required.
- [Persona quickstart tracks](persona-quickstart-tracks.md) — narrow operator, contributor, and agent-developer setup paths.
- [Release and deployment mental model](release-deployment-mental-model.md) — ownership from PR merge through Release Please, deployment, and rollback.
- [Repository ownership](repository-ownership.md) — primary and escalation owners by repository surface.
- [Sample agent practice issue](sample-agent-practice-issue.md) — copyable safe training exercise for first-time agents.
- [Setup troubleshooting matrix](setup-troubleshooting-matrix.md) — symptom-to-diagnostic and remediation lookup.
- [Test command decision tree](test-command-decision-tree.md) — chooses the smallest safe validation command for a change.

## Still unsure?

Start with the [persona chooser](persona-quickstart-tracks.md#persona-chooser). Do not read every guide up front: complete one track until its first-success signal, then open only the references required by your next task.
