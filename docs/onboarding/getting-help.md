---
title: Getting help with a first contribution
description: Route setup, scope, test, CI, and review blockers to the right Frankenbeast discussion with safe diagnostic evidence.
---

# Getting help with a first contribution

Use this guide when a first contribution stops moving and the existing setup or contributor guide does not answer the question. A focused request in the right GitHub thread is easier to answer than a broad “it does not work” report.

## Choose the right help channel

| Blocker | Ask here | Include first |
| --- | --- | --- |
| Setup or bootstrap failure | The issue you plan to work on, or a new bug report when the failure is independent of that issue | Operating system, Node and npm versions, the exact failing command, and the first relevant error |
| Issue scope or acceptance criteria | The issue discussion, before editing | The ambiguous requirement, your proposed interpretation, and the smallest change you think would satisfy it |
| Test or CI failure | The pull request when one exists; otherwise the issue discussion | The failing command or check name, the current branch or PR, and a short redacted error excerpt |
| Pull-request review question | The pull request conversation or the specific inline review thread | The requested change, the code or documentation it affects, and the decision you need from the reviewer |
| Possible security vulnerability | Follow [SECURITY.md](../../SECURITY.md); do not open a public issue with exploit or secret details | Only the private report information requested by the security policy |

Keep one question in one relevant thread. Do not open duplicate issues or repeat the same request across unrelated pull requests. For ordinary setup symptoms, check the [setup troubleshooting matrix](setup-troubleshooting-matrix.md) first. For choosing verification, use the [test command decision tree](test-command-decision-tree.md).

## Collect safe diagnostic evidence

Run only the commands relevant to the blocker. Copy the useful result rather than an entire terminal history:

```bash
# Repository and branch state
git status --short --branch
git log -1 --oneline

# Supported tool versions
node --version
npm --version

# GitHub authentication without printing a token
gh auth status

# Pull-request checks, when a PR exists
PR_NUMBER="123" # replace with your PR number
gh pr checks "$PR_NUMBER" --repo djm204/frankenbeast
```

For a failing local command, include:

1. the exact command;
2. whether it fails every time;
3. the first error and the final summary line;
4. the guide or acceptance criterion you were following; and
5. what changed immediately before the failure.

Do not paste credentials, `.env` contents, provider tokens, approval/session tokens, webhook URLs, private user data, or complete runtime logs into a public issue or pull request. Replace sensitive values with `<redacted>` and keep enough surrounding text to identify the field or failure. When a path contains a personal username or private project name, shorten it to a repository-relative path.

## Copyable help-request template

Post this in the issue or pull request selected above and replace every placeholder:

```text
I am blocked on: <one sentence naming the step>

What I expected:
<expected result or acceptance criterion>

What happened:
<short description>

Exact command:
<one command, or “not command-related”>

Redacted output:
<small relevant excerpt with secrets and private data removed>

Environment:
- OS: <name and version>
- Node: <node --version>
- npm: <npm --version>
- Branch or PR: <branch name or PR link>

What I already tried:
<relevant troubleshooting steps only>

Decision I need:
<one concrete question>
```

Before posting, reread the request as if you were the maintainer: it should identify one blocker, contain reproducible evidence, and ask one answerable question. After a maintainer replies, record the decision in the same thread and continue with the [contributor guide](../../CONTRIBUTING.md).
