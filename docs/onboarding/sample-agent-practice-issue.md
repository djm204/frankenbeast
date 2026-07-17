# Sample practice issue: fix agent practice scoreboard ordering

Use this issue body when onboarding a new coding agent that needs to demonstrate safe edit/test/PR mechanics before touching production packages.

## Description

The agent practice fixture formats scoreboard rows in the same order it receives them. Practice agents should make it sort players from highest score to lowest score.

## Scope

- Only edit files under `fixtures/agent-practice-fixture`.
- Do not modify production packages under `packages/*`.
- Keep the fixture dependency-free and use the built-in Node.js test runner.

## Acceptance criteria

- [ ] `fixtures/agent-practice-fixture/src/scoreboard.js` sorts scores descending.
- [ ] `cd fixtures/agent-practice-fixture && npm test` passes.
- [ ] The PR body states that this is a practice fixture change and does not close production issues.

## Reset instructions

After review, reset the fixture back to the intentionally buggy starting point if you want to reuse the exercise:

```bash
cd fixtures/agent-practice-fixture
npm run reset
```
