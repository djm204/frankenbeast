---
title: Docs-only contribution quickstart
description: A low-overhead path for first-time contributors making a focused Frankenbeast documentation change.
---

# Docs-only contribution quickstart

Use this path when your issue changes Markdown only. It keeps the first contribution focused and avoids starting runtime services that cannot affect documentation. Docker and optional local services are not required for this workflow.

## 1. Confirm the issue is available

Set the issue number, read its acceptance criteria, and check for an existing pull request before editing:

```bash
ISSUE_NUMBER="2540" # replace with your issue
REPO="djm204/frankenbeast"
gh issue view "$ISSUE_NUMBER" --repo "$REPO"
gh pr list --repo "$REPO" --state open --limit 100 \
  --search "$ISSUE_NUMBER OR issue-$ISSUE_NUMBER" \
  --json number,title,headRefName,url
```

If the issue is unclear or an open PR already covers it, comment on the issue instead of starting duplicate work.

## 2. Create a focused branch

Fork and clone the repository if you have not already done so, then branch from the latest upstream `main`:

```bash
gh repo fork djm204/frankenbeast --clone
cd frankenbeast
git remote -v
git fetch upstream main
git switch -c "docs/issue-${ISSUE_NUMBER}-short-description" upstream/main
```

Contributors with direct write access may branch from `origin/main` instead. Keep one issue on one branch and do not include unrelated cleanup.

## 3. Edit and preview

Read the surrounding page and its nearest index before editing. Keep commands copyable, use repository-relative links, and add YAML frontmatter (`title` and `description`) to new pages under `docs/` so documentation tooling can identify them.

Preview the changed Markdown in your editor or GitHub's preview tab. Check headings, lists, tables, code fences, and links. Link a new page from the nearest topic index and from a public entrypoint such as `README.md` when it is part of onboarding.

## 4. Run documentation checks

Install dependencies once if the checkout does not have `node_modules`:

```bash
npm ci
```

Add a focused root regression test when the new guidance or navigation could drift, then run it directly:

```bash
ISSUE_NUMBER="2540" # replace with your issue
npm run test:root -- "tests/docs-issue-${ISSUE_NUMBER}.test.ts"
```

Before opening the pull request, run the complete root suite. It checks repository-local Markdown links in addition to root tests:

```bash
npm run test:root
```

Documentation-only changes do not require the package build, Docker, ChromaDB, Grafana, or Tempo unless the issue explicitly changes or verifies those runtime workflows. Record the exact commands and results in the pull request.

## 5. Open a reviewable pull request

Review and stage only the intended files, use a Conventional Commit, and push the branch:

```bash
git status --short
git diff --check
git diff --stat
git add -p
git diff --cached --stat
git commit -m "docs(onboarding): describe the focused change"
git push --set-upstream origin HEAD
```

Open a pull request against `djm204/frankenbeast:main`. Explain the documentation gap, summarize the new path, list verification results, and include the issue-closing line:

```text
Closes #<issue-number>
```

Before requesting review, verify that the new page is reachable from the intended index, local links pass, CI is green on the current head, and the diff contains no generated files, credentials, or unrelated edits.

For code changes or broader setup work, return to the full [contributor guide](../../CONTRIBUTING.md) and [onboarding checklist](../../ONBOARDING.md).
