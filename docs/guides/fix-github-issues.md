# Fix GitHub Issues with Frankenbeast

## Prerequisites

- `gh` CLI authenticated (`gh auth status`)
- `frankenbeast` installed globally (`npm link` from repo root)
- A GitHub repository with open issues

## How It Works

The `frankenbeast issues` subcommand runs a 4-stage pipeline:

1. **Fetch** — queries GitHub issues via `gh issue list` with your filters
2. **Triage** — LLM classifies each issue as `one-shot` (simple) or `chunked` (multi-file)
3. **Review** — displays a severity-sorted table for human approval (or `--dry-run` to preview only)
4. **Execute** — for each approved issue: builds a PlanGraph, runs implementation + hardening tasks via MartinLoop, creates a PR

Each issue gets its own git branch (`issue-{number}`) and PR with `Fixes #{number}` in the body.

## Examples

### Fix all critical issues

```bash
frankenbeast issues --label critical
```

Fetches all issues labelled `critical`, triages them, presents a review table, and (on approval) fixes each one with a dedicated PR.

### Use GitHub search syntax

```bash
frankenbeast issues --search "label:bug label:high"
```

Passes the query directly to `gh issue list --search`. Supports any [GitHub search qualifier](https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests).

### Preview triage without executing

```bash
frankenbeast issues --label build --dry-run
```

Fetches and triages issues, displays the severity/complexity table, then exits without executing. Use this to verify the triage output before committing to a run.

### Target the upstream repo from a fork

```bash
frankenbeast issues --target-upstream
```

Resolves the GitHub `upstream` remote from the current fork checkout and uses that repository as the canonical target for issue fetch, branch context, and PR creation. This cannot be combined with `--repo`.

## All Flags

| Flag | Description | Default |
|------|-------------|---------|
| `--label <labels>` | Comma-separated label filter | — |
| `--search <query>` | GitHub search syntax query | — |
| `--milestone <name>` | Filter by milestone | — |
| `--assignee <user>` | Filter by assignee | — |
| `--limit <n>` | Max issues to fetch | 30 |
| `--repo <owner/repo>` | Target repository | auto-inferred |
| `--target-upstream` | Use the fork upstream as the canonical target repo | false |
| `--dry-run` | Preview triage, skip execution | false |
| `--budget <n>` | Max spend in USD | 10 |
| `--no-pr` | Skip PR creation | false |
| `--provider <name>` | CLI agent provider | claude |
| `--providers <list>` | Fallback chain for rate limits | — |

## Review Flow

After triage, you see a table:

```
#     Title                              Severity   Complexity  Rationale
---   -----                              --------   ----------  ---------
42    Fix login validation                critical   one-shot    Single file, clear criteria
87    Refactor auth middleware            medium     chunked     Multi-file, architectural
```

Prompts: `Approve all? [Y/n/edit]`

- **Y** — execute all listed issues
- **n** — abort
- **edit** — enter issue numbers to remove, then re-approve

## Budget

The `--budget` flag sets a USD spending cap across all issues (default: $10). When the budget is exhausted, remaining issues are skipped with status `skipped`. Budget tracking converts USD to tokens at 1 USD = 1,000,000 tokens.
