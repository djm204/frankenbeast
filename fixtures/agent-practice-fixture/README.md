# Agent Practice Fixture

This tiny project is a safe sandbox for new agents to practice the mechanics of editing code, running a targeted test, preparing a PR, and resetting a task without touching production Frankenbeast packages.

It is intentionally excluded from production builds: the root `package.json` workspace list only includes `packages/*`, and this fixture lives under `fixtures/agent-practice-fixture` with its own private `package.json` and Node.js built-in test command.

## Practice task

The starting bug is in `src/scoreboard.js`: `formatScoreboard()` preserves input order instead of ranking players from highest score to lowest score.

Expected fix path:

1. Run the failing fixture test:

   ```bash
   cd fixtures/agent-practice-fixture
   npm test
   ```

2. Edit `src/scoreboard.js` so scores are sorted descending. Keep the fixture tiny; do not change production packages.
3. Re-run `npm test` in this directory.
4. Open a practice PR that references the sample issue body in `docs/onboarding/sample-agent-practice-issue.md`.

## Reset the fixture

After a practice run, reset the fixture to the known buggy state:

```bash
cd fixtures/agent-practice-fixture
npm run reset
```

The reset script copies `fixtures/buggy/scoreboard.js` back over `src/scoreboard.js`. `fixtures/solution/scoreboard.js` shows the expected end state for trainers or reviewers, but new agents should fix the bug themselves before reading it.
