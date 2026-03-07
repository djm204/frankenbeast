# Chunk 10: Trace Viewer Wiring

## Objective

When `--verbose` is set, instantiate `SQLiteAdapter` and `TraceServer` from `@frankenbeast/observer` to provide a trace viewer at `http://localhost:4040`. Manage lifecycle (start on init, stop on finalize).

## Files

- **Edit**: `franken-orchestrator/src/cli/dep-factory.ts`
- **Edit**: `franken-orchestrator/src/cli/session.ts` (or wherever `finalize()` lives)
- **Create**: `franken-orchestrator/test/cli/trace-viewer.test.ts`
- **Read**: `franken-observer/src/ui/TraceServer.ts`
- **Read**: `franken-observer/src/adapters/sqlite/SQLiteAdapter.ts`

## Success Criteria

- [ ] When `verbose: true`, `createCliDeps()` instantiates `SQLiteAdapter(paths.tracesDb)`
- [ ] When `verbose: true`, `createCliDeps()` instantiates `TraceServer({ adapter: sqliteAdapter, port: 4040 })`
- [ ] `TraceServer.start()` is called during deps creation
- [ ] Logger outputs: `[observer] Trace viewer: http://localhost:4040`
- [ ] `CliDeps.finalize()` calls `traceServer.stop()` and `sqliteAdapter.close()`
- [ ] When `verbose: false`, no SQLiteAdapter or TraceServer are created
- [ ] If `SQLiteAdapter` constructor throws (e.g., `better-sqlite3` not available), log a warning and continue without traces — do NOT crash
- [ ] Test: verify `TraceServer.start()` is called when verbose=true (mock the classes)
- [ ] Test: verify nothing is created when verbose=false
- [ ] Test: verify graceful handling when SQLiteAdapter throws
- [ ] `npm run build` succeeds

## Verification Command

```bash
cd franken-orchestrator && npx tsc --noEmit && npx vitest run test/cli/trace-viewer.test.ts && npm run build
```

## Hardening Requirements

- Import `SQLiteAdapter` and `TraceServer` dynamically (`await import(...)`) to avoid crashing if `better-sqlite3` native module isn't installed
- The `paths.tracesDb` path should already exist from `scaffoldFrankenbeast()` — verify the directory exists, not just the file
- Port 4040 should be configurable via config file in the future, but hardcode for now
- The trace viewer routes are: `GET /` (HTML), `GET /api/traces` (list), `GET /api/traces/:id` (detail)
- Use the `'observer'` service label for all trace viewer log messages
- Make sure `finalize()` is idempotent — calling it twice should not throw
