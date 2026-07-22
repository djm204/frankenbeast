# CLI plan example

This project supplies a small design document to the Frankenbeast planner. From a Frankenbeast checkout, first run `npm run local:link` at the repository root so the current `frankenbeast` binary is available on `PATH`, then copy or scaffold this project.

```bash
npm ci
npm run help
npm run plan
```

`npm run plan` executes:

```bash
frankenbeast plan --design-doc docs/sample-design.md
```

The planner writes generated chunks under `.fbeast/plans/`. Configure the credentials for your selected provider before running the planner. The example defaults to the CLI's normal provider selection; pass additional supported CLI arguments after `--`, for example `npm run plan -- --provider codex`.
