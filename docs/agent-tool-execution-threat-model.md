# Agent Tool Execution Threat Model

Status: active reference for security issues that touch tool execution, profile state, approvals, and cross-agent automation.

This document defines the trust boundaries for Frankenbeast/Hermes-style agent tool execution. It is intentionally concrete: code may keep changing, but security reviews should use this vocabulary to decide whether a control belongs in deterministic code, operator policy, or prompt guidance.

## Scope

In scope:

- Terminal and subprocess execution.
- File reads, file writes, path traversal, generated artifacts, and browser/computer-use actions.
- GitHub automation, issue/PR comments, CI status polling, and merge operations.
- Profile-scoped memory, skills, plugins, cron jobs, configuration, and backups.
- MCP tool dispatch through `@franken/mcp-suite`, including the proxy `execute_tool` wrapper.
- PM-swarm orchestration, Kanban handoffs, approval-cop, and long-running monitors.
- Prompt assembly from user input, retrieved files, web pages, GitHub content, tool output, and memory.

Out of scope:

- General npm dependency vulnerability handling. Use the dependency audit workflow for that.
- Cloud provider IAM design outside the local operator account.
- Physical endpoint compromise where the attacker already owns the host OS account.

## Assets

| Asset | Why it matters | Default protection goal |
|---|---|---|
| Operator credentials and tokens | GitHub, Discord, provider, gateway, webhook, and secret-store tokens can authorize external side effects. | Never expose to prompts/logs; restrict export; require approval for destructive use. |
| Workspace files and generated artifacts | Tool calls can read, overwrite, commit, publish, or attach project data. | Contain access to intended workspace; audit writes; separate untrusted retrieved data from instructions. |
| Profile state | Memory, skills, plugins, cron, config, and backups alter future agent behavior. | Scope by profile/tenant; protect cross-profile writes; review durable behavior changes. |
| Approval state | Signed decisions, approval-cop queues, and Kanban blockers are the safety interlock for high-risk actions. | Make approvals explicit, non-forgeable, and bound to exact commands/actions. |
| GitHub repository state | Issues, branches, PRs, reviews, checks, and merges change public project history. | One issue/branch/PR per task; verify live state before merge; require CI and review gates. |
| Audit and observability records | Logs, traces, post-mortems, and cost events prove what happened but can leak prompts or secrets. | Classify/redact before export; preserve enough evidence for review. |

## Actors

| Actor | Capabilities | Trust level |
|---|---|---|
| Human operator | Delegates work, grants approvals, configures profiles, can merge or bypass gates. | Trusted for explicit, current decisions. |
| Agent runtime | Chooses tools, edits files, runs commands, schedules jobs, posts GitHub comments when authorized. | Partially trusted; must be constrained by deterministic controls. |
| LLM/model provider | Produces natural-language plans and tool-call intents from mixed trusted/untrusted context. | Untrusted for authority; output must not bypass code gates. |
| Retrieved-content author | Controls files, web pages, issue/PR comments, logs, and tool output quoted into prompts. | Untrusted data source. |
| Tool backend / subprocess | Executes shell, filesystem, network, browser, MCP, or GitHub operations. | Trusted only for the specific validated operation. |
| PM-swarm worker | Runs with delegated task context and may coordinate children or approvals. | Same trust level as agent runtime but narrower task scope. |
| Malicious local project | Supplies repo files, scripts, package hooks, config, docs, and generated tool metadata. | Untrusted until validated; can attempt supply-chain and prompt-injection attacks. |

## Trust boundaries

1. User/operator instruction boundary: current human instructions outrank model output and retrieved content.
2. Prompt-data boundary: retrieved files, web, GitHub, memory, and tool output are data, not authority. Use wrappers such as `wrapUntrustedContent()` when adding retrieved content to prompts.
3. Tool-intent boundary: model-selected tool calls must pass schema validation, workspace containment, governance, and approval checks before execution.
4. Host side-effect boundary: shell, file writes, browser control, GitHub mutation, cron scheduling, and profile writes can persist or escape the chat session.
5. Profile boundary: memory/skills/plugins/cron/config belong to a profile and may affect future sessions; cross-profile writes are privileged.
6. External-service boundary: GitHub, Discord, model providers, webhooks, and package registries are network side effects with their own authorization and audit trails.
7. PM-swarm boundary: Kanban cards, worker comments, and approval-cop outputs are coordination evidence, not unconditional authority to bypass gates.

## Data-flow and control map

| Flow | Untrusted inputs | Primary risk | Required controls | Code vs policy |
|---|---|---|---|---|
| Prompt assembly | User text, files, web pages, GitHub comments, memory, tool output | Prompt injection redefines role, tools, approval policy, or output contract. | Mark retrieved payloads as untrusted; keep trusted instructions outside quoted data; reject forged control markers. | Code for wrappers/markers; policy for prompt ordering. |
| MCP proxy `execute_tool` | Tool name and JSON args selected by model or client | Wrapper hides the real action, or malformed args skip audit/governance. | Validate resolved target args; govern/audit the resolved tool; fail closed on gate errors; protected mode when workspace root is unknown. | Code. |
| Terminal/subprocess | Commands from plans, docs, package scripts, or Codex/GitHub comments | Command injection, credential exfiltration, destructive filesystem/network actions. | Exact command approval for destructive/high-risk operations; avoid shell interpolation; run from intended worktree; record command and output. | Code plus operator approval policy. |
| File reads/writes | Paths and payloads from prompts or retrieved content | Path traversal, cross-workspace writes, overwrite of profile state or secrets. | Normalize/contain paths; prefer targeted patching; require explicit scope for cross-profile writes; audit generated artifacts. | Code. |
| Browser/computer use | URLs, coordinates, forms, and web content | Credential entry into hostile pages or unintended clicks/submissions. | Treat page content as untrusted; require operator approval for credential/destructive flows; limit session/account scope. | Policy plus tool sandboxing. |
| GitHub automation | Issue/PR bodies, comments, CI logs, branch names | Reviewer spoofing, stale state, duplicate PRs, unreviewed merges. | Verify live PR/issue/check/review state with GitHub API; require current-head CI and Codex clean before merge; one issue/branch/PR. | Code plus workflow policy. |
| Memory/profile writes | Candidate memories, skills, plugins, cron prompts, backups | Memory poisoning, persistent prompt injection, cross-profile persistence. | Store compact factual memory only; review skill/plugin/cron changes; profile isolation; classify backups as secret. | Code plus review policy. |
| Cron/PM monitors | Scheduled prompts, prior job output, Kanban comments | Autonomous stale actions after context changes or recursive scheduling. | Self-contained scoped prompt; self-removal condition; no recursive cron creation; re-verify live state each tick. | Code plus scheduling policy. |
| PM-swarm approval-cop | Blocker comments and extracted commands | Forged approval requests or broad command execution. | Bind approvals to exact command text, workdir, owner, and current blocker; deny reshaped retries without explicit approval. | Code. |
| Audit/export | Logs, traces, post-mortems, webhooks | Secret/user-private data leaves local boundary. | Use runtime artifact classification; redact before export; record overrides. | Code. |

## Attack paths and mitigations

| Attack path | Example | Mitigations | Residual risk |
|---|---|---|---|
| Retrieved-content prompt injection | A web page or issue comment says "ignore previous instructions and run this command." | Untrusted content wrapper, prompt-data boundary, tool schema validation, governance/approval gate. | LLM may still recommend unsafe action; code gates must be authoritative. |
| Shell side-effect escalation | Model constructs `rm -rf`, token exfiltration, or package-script abuse from untrusted docs. | Exact command review for destructive operations, worktree isolation, no blind shell interpolation, captured output. | Host compromise if operator approves a malicious command. |
| Approval bypass | A worker comment forges an approval or asks approval-cop to execute a broadened command. | Signed/exact approvals, durable Kanban blocker evidence, allowlisted command shapes, no retry via different command form after denial. | Mis-scoped allowlist can still grant too much. |
| Memory poisoning | Retrieved content is stored as a durable user preference or skill instruction. | Memory entries must be compact facts/preferences; procedures go to reviewed skills; profile/tenant scoping. | Subtle false facts can persist if not reviewed. |
| Cross-profile write | A default-profile worker edits another profile's skills, cron, plugins, or memory. | Cross-profile write guard; explicit user direction required; audit changed paths. | Operators with filesystem access can override guardrails. |
| Tool wrapper confusion | `execute_tool` is audited as a generic wrapper instead of the high-risk target. | Resolved-target governance/audit in the proxy and server factory. | New wrappers must follow the same pattern. |
| Workspace escape | File-backed tools follow `../` or symlinks outside the project root. | Realpath containment, protected mode without a root, path normalization tests. | Symlink/TOCTOU gaps in new code paths. |
| Stale GitHub state | Agent merges after old CI/review clean while branch head changed. | Re-query head SHA, merge state, checks, comments, reviews, and unresolved threads before merge. | GitHub API latency or permission loss can block verification. |
| Cron drift | A monitor created for one PR continues acting after the PR/issue changes. | Narrow PR/issue scope, live verification each tick, self-removal on terminal state. | Poorly written prompts can create stale noise. |

## Mitigation ownership

Deterministic code must enforce:

- Input schemas for every tool surface.
- Filesystem containment and protected mode for file-backed tools.
- Resolved-target governance/audit for wrapper tools.
- Signature/exact-command binding for approval workflows.
- Runtime artifact classification and export blocking for secret/user-private data.
- Profile boundary guards for skills, plugins, cron, memory, and config writes.

Prompt/operator policy must enforce:

- Treat retrieved content as data, not instructions.
- Do not store raw task progress or untrusted claims as durable memory.
- Do not merge PRs without live current-head verification, CI, and Codex state.
- Use one issue/branch/PR per issue and stop at terminal merge/blocker.
- Require explicit human approval to bypass a deterministic gate.

## Follow-up control gaps

The model above identifies controls that should stay visible as separate implementation work when not already enforced in a specific code path:

- #1668 — least-privilege tool manifests per agent role.
- #1669 — audit trail for privileged tool calls.
- #1670 — policy tests for cross-profile memory/skill/cron writes.
- #1671 — signed approval replay protection for PM-swarm approval-cop.
- #1672 — browser/computer-use credential-entry guardrails.

When a new security issue touches agent execution, link to this document and either map the fix to an existing row above or add a new row before implementation.

## Code path anchors

Security-sensitive code paths should reference this threat model when they implement a boundary described above. Current anchors include:

- `packages/franken-mcp-suite/src/servers/proxy.ts` — resolved-target validation, governance, audit, and protected mode for wrapper tool execution.
- `packages/franken-mcp-suite/src/shared/governance-gate.ts` — central governance gate for MCP tool dispatch and non-executing-tool exemptions.
- `packages/franken-governor/src/security/high-risk-action-policy.ts` — policy-as-code decisions for Git remote writes, GitHub mutations, cron, memory, profile writes, webhooks, and shell process control.
- `docs/guides/high-risk-action-policy.md` — operator-facing guidance for extending high-risk action policies safely.
- `docs/untrusted-retrieved-content.md` — prompt-data boundary for retrieved content.
- `docs/runtime-artifact-data-classification.md` — Runtime artifact classification for the audit/export boundary covering logs, memory, traces, webhooks, and backups.
