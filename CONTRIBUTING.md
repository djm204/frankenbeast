# Contributing to Frankenbeast

Thank you for improving Frankenbeast. This guide is the shortest path from choosing one issue to opening a reviewable pull request. For environment details beyond this path, use the [onboarding checklist](ONBOARDING.md) or the [goal-based onboarding index](docs/onboarding/README.md).

## Find a starter issue

List open issues intended for new contributors before choosing work:

```bash
gh issue list --repo djm204/frankenbeast \
  --state open \
  --label "good first issue" \
  --limit 20 \
  --json number,title,labels,url
```

Pick an issue only when all of these are true:

- You understand the requested outcome and acceptance criteria.
- The change fits one focused pull request.
- No open pull request already claims the issue.
- The issue discussion does not show another contributor actively working on it.

After checking for duplicate work in the next section, leave a short claim comment so other contributors can coordinate:

```bash
ISSUE_NUMBER="2541" # replace with the issue you selected
gh issue comment "$ISSUE_NUMBER" --repo djm204/frankenbeast \
  --body "I plan to work on this issue. I will keep the change scoped to its acceptance criteria."
```

If the scope is unclear, ask one focused question instead of claiming the issue or guessing.

## Before you start

1. Read the issue body, acceptance criteria, labels, and discussion end to end before editing.
2. Check the issue discussion and open pull requests so you do not duplicate active work:

   ```bash
   ISSUE_NUMBER="2542" # replace with the issue you selected
   gh issue view "$ISSUE_NUMBER" --repo djm204/frankenbeast
   gh pr list --repo djm204/frankenbeast --state open --limit 100 \
     --search "$ISSUE_NUMBER OR issue-$ISSUE_NUMBER" --json number,title,headRefName,url
   gh pr list --repo djm204/frankenbeast --state open --limit 100 \
     --json number,title,headRefName,url \
     --jq ".[] | select(.headRefName | contains(\"issue-$ISSUE_NUMBER-\"))"
   ```

3. Comment on the issue when its scope is unclear or another contributor may already be working on it. Keep one issue, one focused branch, and one pull request.
4. Never commit credentials or local runtime state. Keep `.env`, provider keys, `.fbeast/`, generated output, and personal audit artifacts out of the change.

## Set up your checkout

Fork and clone the repository with the GitHub CLI:

```bash
gh repo fork djm204/frankenbeast --clone
cd frankenbeast
git remote -v
git fetch upstream main
git switch -c docs/short-description upstream/main
npm run bootstrap -- --no-docker
```

If you have direct write access and intentionally clone the upstream repository instead, create the branch from an up-to-date `origin/main`. Use a branch name that describes the single change, such as `docs/clarify-bootstrap` or `fix/chat-timeout`.

The bootstrap command checks the supported Node.js and npm versions, prepares `.env` when needed, and installs dependencies. If it fails, follow the [setup troubleshooting matrix](docs/onboarding/setup-troubleshooting-matrix.md) before changing source files.

## Make one focused change

- Read the nearest package `README.md`, tests, and repository instructions before editing.
- Change only files required by the selected issue. Do not mix cleanup or unrelated refactors into the pull request.
- Update public documentation when behavior, commands, configuration, or contributor workflow changes.
- Add or update a focused regression test when the change can drift. Documentation changes commonly use a root test under `tests/docs-issue-<number>.test.ts`.

## Verify the change

Use the [test command decision tree](docs/onboarding/test-command-decision-tree.md) to select the narrowest meaningful check, then add broader gates when the change crosses package or root boundaries.

For a documentation-only change with a focused guard:

```bash
ISSUE_NUMBER="2542" # replace with the issue you selected
npm run test:root -- "tests/docs-issue-${ISSUE_NUMBER}.test.ts"
```

For package code, run that package's targeted test, typecheck, and build scripts when available. Before opening the pull request, record every command you ran and its real result; do not claim a skipped check passed.

## Commit and open a pull request

Review the exact diff, then create a Conventional Commit:

If `git status --short` shows an intentional new file with the `??` prefix, first run `git add --intent-to-add <new-path>` for that path. This lets patch mode present the new file without staging unrelated untracked files.

```bash
git status --short
git diff --check
git diff --stat
git add -p # stage only the changes that belong to this issue
git diff --cached --stat
COMMIT_SUBJECT="docs(onboarding): describe your issue-specific change" # replace this example
git commit -m "$COMMIT_SUBJECT"
git push --set-upstream origin HEAD
```

Open the pull request against `djm204/frankenbeast:main`. Include the problem, the focused solution, verification evidence, and a closing keyword on its own line:

```text
Closes #<issue-number>
```

Keep the pull request title in Conventional Commit form, for example `docs(onboarding): clarify first contribution setup`. If you are using `gh`, `gh pr create --repo djm204/frankenbeast --base main` opens the interactive form.

## Before requesting review

- [ ] The pull request addresses one issue and contains no unrelated files.
- [ ] Documentation and commands match the current repository state.
- [ ] Relevant tests, typechecks, lint, and builds pass, or the pull request explicitly explains why a gate could not run.
- [ ] The PR body includes exact verification commands and `Closes #<issue-number>`.
- [ ] CI is green on the current head commit.
- [ ] Review feedback is addressed with code, tests, or a clear technical explanation.

After review changes, rerun the affected checks and update the verification evidence. A new commit means the current head must pass CI again before merge.

## Getting help

For setup failures, start with the [setup troubleshooting matrix](docs/onboarding/setup-troubleshooting-matrix.md). For test selection, use the [test command decision tree](docs/onboarding/test-command-decision-tree.md). For package ownership and architecture, use the [architecture map](docs/onboarding/architecture-map.md) and [repository ownership manifest](docs/onboarding/repository-ownership.md). Ask a focused question on the issue when these guides do not resolve the blocker.
