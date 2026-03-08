# GitHub Issues as Work Source

> Design doc for `frankenbeast issues` — a subcommand that fetches GitHub issues, triages complexity, and autonomously fixes them with one PR per issue.

## Problem

Frankenbeast can execute work from design docs and chunk files, but there's no way to point it at a GitHub issue tracker and say "fix these." The 2026-03-08 codebase audit produced 58 issues that need systematic resolution. Manual chunk creation per issue doesn't scale.

## Solution

A new `frankenbeast issues` subcommand that:

1. Fetches GitHub issues (filtered by label, milestone, search query, assignee)
2. LLM-triages each issue as one-shot or needs-chunking
3. Presents the triage plan for HITL approval
4. Executes each issue through the existing pipeline (MartinLoop + GitBranchIsolator)
5. Creates one PR per issue with `Fixes #N` for auto-close on merge

## CLI Interface

```bash
frankenbeast issues [options]

Options:
  --label <labels>       Filter by label(s), comma-separated
  --milestone <name>     Filter by milestone
  --search <query>       GitHub search query (label:critical is:open etc.)
  --assignee <login>     Filter by assignee
  --limit <n>            Max issues to process (default: 30)
  --repo <owner/repo>    Target repo (default: inferred from git remote)
  --provider <name>      CLI agent provider (default: claude)
  --providers <list>     Fallback chain
  --budget <amount>      Token budget in USD (default: $10)
  --no-pr                Skip PR creation
  --base-branch <name>   Base branch (default: main)
  --dry-run              Triage only, don't execute
```

## Pipeline

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐     ┌───────────┐
│  Fetch       │────>│  Triage      │────>│  HITL Review  │────>│  Execute  │
│  (gh issue   │     │  (LLM: one-  │     │  (show plan,  │     │  (per     │
│   list)      │     │   shot or    │     │   approve/    │     │   issue)  │
│              │     │   chunk?)    │     │   remove)     │     │           │
└─────────────┘     └──────────────┘     └──────────────┘     └─────┬─────┘
                                                                     │
                                                          ┌──────────┴──────────┐
                                                          v                     v
                                                    ┌───────────┐        ┌────────────┐
                                                    │ One-shot   │        │ Chunked    │
                                                    │ impl +     │        │ LLM decomp │
                                                    │ harden     │        │ -> N tasks │
                                                    └─────┬─────┘        └──────┬─────┘
                                                          │                     │
                                                          v                     v
                                                    ┌─────────────────────────────────┐
                                                    │  GitBranchIsolator               │
                                                    │  fix/issue-<number>              │
                                                    │  MartinLoop per task             │
                                                    │  Auto-commit per iteration       │
                                                    └─────────────┬───────────────────┘
                                                                  v
                                                    ┌─────────────────────────────────┐
                                                    │  PrCreator                       │
                                                    │  PR body: "Fixes #<number>"      │
                                                    │  LLM-generated title/description │
                                                    └─────────────────────────────────┘
```

## Components

### 1. IssueFetcher

Wraps `gh` CLI calls. Responsible for fetching and normalizing GitHub issues.

```typescript
interface GithubIssue {
  number: number;
  title: string;
  body: string;
  labels: string[];
  state: string;
  url: string;
}

interface IssueFetchOptions {
  repo?: string;          // owner/repo, inferred from git remote if omitted
  label?: string[];
  milestone?: string;
  search?: string;
  assignee?: string;
  limit?: number;         // default 30
}

interface IssueFetcher {
  fetch(options: IssueFetchOptions): Promise<GithubIssue[]>;
  inferRepo(): Promise<string>;
}
```

Implementation: executes `gh issue list --json number,title,body,labels,state,url` with the appropriate filters. Infers repo via `gh repo view --json nameWithOwner` when `--repo` is not provided.

### 2. IssueTriage

LLM-powered complexity assessment. Single call with all fetched issues.

```typescript
type IssueComplexity = 'one-shot' | 'chunked';

interface TriageResult {
  issueNumber: number;
  complexity: IssueComplexity;
  rationale: string;
  estimatedScope: string;   // e.g. "2 files, config wiring"
}

interface IssueTriage {
  triage(issues: GithubIssue[], llm: ICliProvider): Promise<TriageResult[]>;
}
```

**Triage heuristics the LLM applies:**
- One-shot: single file or tightly scoped fix, 1-2 acceptance criteria, clear fix path
- Chunked: multi-file changes, 3+ acceptance criteria, needs architectural changes, has dependencies on other work

### 3. IssueGraphBuilder

Implements `GraphBuilder`. Produces a `PlanGraph` per issue.

```typescript
interface IssueGraphBuilder {
  buildForIssue(issue: GithubIssue, triage: TriageResult): Promise<PlanGraph>;
}
```

**One-shot issues** produce two tasks:
- `impl:issue-<N>` — objective is the issue body, prompt includes title and acceptance criteria
- `harden:issue-<N>` — review, test, verify; depends on impl task

**Chunked issues** produce N chunk pairs:
- LLM decomposes the issue into `ChunkDefinition[]` (reusing existing LlmGraphBuilder logic)
- Each chunk becomes `impl:issue-<N>/chunk-<M>` + `harden:issue-<N>/chunk-<M>`
- Chunks have linear dependency order within the issue
- No cross-issue dependencies

### 4. IssueRunner

Outer loop orchestrator. Iterates issues in priority order.

```typescript
interface IssueOutcome {
  issueNumber: number;
  issueTitle: string;
  status: 'fixed' | 'failed' | 'skipped';
  prUrl?: string;
  tokensUsed: number;
  error?: string;
}

interface IssueRunnerConfig {
  issues: GithubIssue[];
  triageResults: TriageResult[];
  provider: string;
  providers?: string[];
  budget: number;
  baseBranch: string;
  noPr: boolean;
  repo: string;
}

interface IssueRunner {
  run(config: IssueRunnerConfig): Promise<IssueOutcome[]>;
}
```

**Per-issue execution:**
1. Build `PlanGraph` via `IssueGraphBuilder`
2. Create branch `fix/issue-<N>` via `GitBranchIsolator`
3. Execute tasks via `CliSkillExecutor` (MartinLoop per task)
4. On success: `PrCreator.create()` with `Fixes #<N>` in body
5. On failure: log error, continue to next issue
6. On budget exceeded: stop batch, report partial results

**Priority ordering:** Issues sorted by severity label (critical > high > medium > low), then by issue number.

### 5. HITL Review

Presented after triage, before execution.

```
┌────┬───────────────────────────────────────────┬──────────┬───────────┬─────────────────────┐
│ #  │ Title                                     │ Severity │ Triage    │ Rationale           │
├────┼───────────────────────────────────────────┼──────────┼───────────┼─────────────────────┤
│ 42 │ CLI config surface not applied            │ critical │ chunked   │ 4 files, 3 criteria │
│ 45 │ Resume flag is unwired                    │ high     │ one-shot  │ 1 file, clear fix   │
│ 48 │ Build script fails                        │ medium   │ one-shot  │ package.json only   │
└────┴───────────────────────────────────────────┴──────────┴───────────┴─────────────────────┘

Approve all? [Y/n/edit]
```

User can:
- **Y** — approve and execute all
- **n** — abort
- **edit** — enter issue numbers to remove, then re-confirm

Uses existing CLI prompt pattern from the governor channel.

## Branch and PR Strategy

- **Branch naming:** `fix/issue-<number>` (e.g., `fix/issue-42`)
- **Chunked issues:** all chunks execute on the same issue branch. Sub-branches for individual chunks merge back into the issue branch via squash.
- **PR title:** LLM-generated conventional commit (e.g., `fix: apply CLI config to beast loop execution (#42)`)
- **PR body:**
  ```markdown
  ## Summary
  <LLM-generated description of what changed>

  Fixes #42

  ## Changes
  <file-level summary>

  ## Acceptance Criteria
  <checked-off criteria from the issue>
  ```
- **One PR per issue, always.** No batching across issues.

## Integration with Existing Components

| Component | Usage | Changes Needed |
|---|---|---|
| `GraphBuilder` interface | `IssueGraphBuilder` implements it | None |
| `CliSkillExecutor` | Executes tasks per issue | None |
| `MartinLoop` | Runs agent iterations | None |
| `GitBranchIsolator` | Branch per issue | None |
| `PrCreator` | Creates PR | Add issue reference (`Fixes #N`) to PR body |
| `CliObserverBridge` | Token/cost tracking | None |
| `FileCheckpointStore` | Crash recovery per issue | Scope checkpoint key by issue number |
| `BeastLogger` | Logging | Add `[issues]` service label |
| `ProviderRegistry` | Provider selection/fallback | None |
| CLI args (`args.ts`) | Parse `issues` subcommand | Add `issues` subcommand + flags |
| `dep-factory.ts` | Wire dependencies | Add issue-specific dep creation |

## Error Handling

| Scenario | Behavior |
|---|---|
| `gh` not installed or not authed | Abort with clear error message |
| Issue fetch returns 0 results | Abort with "no matching issues" |
| Triage LLM call fails | Retry once, then abort |
| Individual issue execution fails | Log failure, continue to next issue |
| Merge conflict on issue branch | Existing conflict resolution in CliSkillExecutor |
| Budget exceeded mid-batch | Stop, report which issues completed vs remaining |
| Crash mid-execution | Checkpoint recovery: resume skips completed tasks |

## File Structure

```
franken-orchestrator/src/
├── issues/                          # New directory
│   ├── issue-fetcher.ts             # GH CLI wrapper
│   ├── issue-triage.ts              # LLM complexity assessment
│   ├── issue-graph-builder.ts       # GraphBuilder impl for issues
│   ├── issue-runner.ts              # Outer loop orchestrator
│   └── types.ts                     # GithubIssue, TriageResult, IssueOutcome
├── cli/
│   ├── args.ts                      # + issues subcommand parsing
│   ├── session.ts                   # + runIssues() session method
│   └── run.ts                       # + issues subcommand dispatch
└── closure/
    └── pr-creator.ts                # + issue reference in PR body
```

## Documentation Updates

After implementation, update:
- `docs/ARCHITECTURE.md` — add issues pipeline to system diagram, new component descriptions
- `docs/RAMP_UP.md` — add `issues` subcommand to CLI section, update known limitations
- `docs/PROGRESS.md` — log the feature implementation
- `docs/guides/` — consider a `fix-github-issues.md` quickstart guide
