# Minimal orchestrator configuration

This example shows the smallest useful project-local runtime configuration while leaving provider selection and credentials outside version control.

From a Frankenbeast checkout, first run `npm run local:link` at the repository root so the current `frankenbeast` binary is available on `PATH`, then copy or scaffold this project.

```bash
npm ci
npm run help
npm run plan
npm start
```

`npm run plan` creates chunks under `.fbeast/plans/` from the bundled design document. `npm start` then runs those chunks with `frankenbeast run --config .fbeast/config.json`. Replace the bundled document or pass an existing plan directory using supported CLI arguments after `--` when adapting the example.

Configuration precedence is CLI flags, then `FRANKEN_*` environment variables, then this JSON file, then built-in defaults. The sample uses valid conservative budgets and keeps heartbeat/tracing opt-in features disabled.
