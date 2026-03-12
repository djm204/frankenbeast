# Beasts Dispatch Station Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a durable Beast dispatch system with a fixed catalog, SQLite-backed run/attempt history, secure and rate-limited Beast API routes, CLI spawn/control commands, dashboard dispatch/monitoring UI, chat-triggered Beast creation, process-based execution, and Grafana-friendly telemetry.

**Architecture:** Build a dedicated `src/beasts/` domain inside `franken-orchestrator`, backed by SQLite and append-only log files under `.frankenbeast/.build/`. Expose Beast routes from the existing Hono chat app, drive all launch/control surfaces through shared services, implement a real `ProcessBeastExecutor` plus stub `ContainerBeastExecutor`, and extend `franken-web` with a new Beast dispatch station that consumes the same API.

**Tech Stack:** TypeScript (ESM, strict), Node.js child process and filesystem APIs, Hono, Zod, better-sqlite3, Vitest, React, existing `franken-orchestrator` chat/network runtime, existing `franken-web` component and API client patterns

**Design Doc:** `docs/plans/2026-03-10-beasts-dispatch-design.md`

---

### Task 1: Add Beast domain types, project paths, and SQLite schema bootstrap

**Files:**
- Create: `packages/franken-orchestrator/src/beasts/types.ts`
- Create: `packages/franken-orchestrator/src/beasts/repository/sqlite-schema.ts`
- Modify: `packages/franken-orchestrator/src/cli/project-root.ts`
- Modify: `packages/franken-orchestrator/src/index.ts`
- Test: `packages/franken-orchestrator/tests/unit/beasts/types.test.ts`
- Test: `packages/franken-orchestrator/tests/unit/cli/project-root.test.ts`

**Step 1: Write the failing tests**

Cover:

```ts
expect(paths.beastsDb).toContain('.frankenbeast/.build/beasts.db');
expect(paths.beastLogsDir).toContain('.frankenbeast/.build/beasts/logs');
expectTypeOf<BeastRunStatus>().toEqualTypeOf<
  'queued' | 'interviewing' | 'running' | 'pending_approval' | 'completed' | 'failed' | 'stopped'
>();
```

**Step 2: Run the focused tests to verify they fail**

Run: `npm --workspace franken-orchestrator test -- tests/unit/beasts/types.test.ts tests/unit/cli/project-root.test.ts`
Expected: FAIL because Beast path fields and Beast types do not exist

**Step 3: Add Beast paths and core type definitions**

Add canonical types for:

- `BeastDefinition`
- `BeastRun`
- `BeastRunAttempt`
- `BeastRunEvent`
- `BeastDispatchSource`
- `BeastExecutionMode`
- `BeastInterviewSession`

Extend `ProjectPaths` with:

- `beastsDb`
- `beastsDir`
- `beastLogsDir`

**Step 4: Add SQLite schema bootstrap**

Define table creation SQL for:

- `beast_runs`
- `beast_run_attempts`
- `beast_run_events`
- `beast_interview_sessions`

**Step 5: Re-run the focused tests**

Run: `npm --workspace franken-orchestrator test -- tests/unit/beasts/types.test.ts tests/unit/cli/project-root.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/franken-orchestrator/src/beasts/types.ts \
  packages/franken-orchestrator/src/beasts/repository/sqlite-schema.ts \
  packages/franken-orchestrator/src/cli/project-root.ts \
  packages/franken-orchestrator/src/index.ts \
  packages/franken-orchestrator/tests/unit/beasts/types.test.ts \
  packages/franken-orchestrator/tests/unit/cli/project-root.test.ts
git commit -m "feat(orchestrator): add beast domain types and storage paths"
```

### Task 2: Implement the SQLite repository and append-only log store

**Files:**
- Create: `packages/franken-orchestrator/src/beasts/repository/sqlite-beast-repository.ts`
- Create: `packages/franken-orchestrator/src/beasts/events/beast-log-store.ts`
- Create: `packages/franken-orchestrator/tests/unit/beasts/sqlite-beast-repository.test.ts`
- Create: `packages/franken-orchestrator/tests/unit/beasts/beast-log-store.test.ts`

**Step 1: Write the failing repository tests**

Cover:

```ts
const run = repo.createRun(input);
expect(repo.listRuns()[0]?.id).toBe(run.id);
expect(repo.createAttempt(run.id).attemptNumber).toBe(1);
expect(repo.restartAttempt(run.id).attemptNumber).toBe(2);
expect(repo.getRun(run.id)?.status).toBe('queued');
```

and log assertions:

```ts
await logStore.append(runId, attemptId, 'stdout', 'hello');
expect(await logStore.read(runId, attemptId)).toContain('hello');
```

**Step 2: Run the focused tests to verify they fail**

Run: `npm --workspace franken-orchestrator test -- tests/unit/beasts/sqlite-beast-repository.test.ts tests/unit/beasts/beast-log-store.test.ts`
Expected: FAIL because the repository and log store do not exist

**Step 3: Implement the repository**

Support:

- create/get/list runs
- create attempts
- append/list events
- mark running/completed/failed/stopped
- query current attempt
- list attempts by run
- persist immutable config snapshots as JSON text

**Step 4: Implement the log store**

Use append-only files at `paths.beastLogsDir/<runId>/<attemptId>.log` with line-oriented records.

**Step 5: Re-run the focused tests**

Run: `npm --workspace franken-orchestrator test -- tests/unit/beasts/sqlite-beast-repository.test.ts tests/unit/beasts/beast-log-store.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/franken-orchestrator/src/beasts/repository/sqlite-beast-repository.ts \
  packages/franken-orchestrator/src/beasts/events/beast-log-store.ts \
  packages/franken-orchestrator/tests/unit/beasts/sqlite-beast-repository.test.ts \
  packages/franken-orchestrator/tests/unit/beasts/beast-log-store.test.ts
git commit -m "feat(orchestrator): persist beast runs attempts and logs"
```

### Task 3: Add the fixed Beast catalog and interview/config contracts

**Files:**
- Create: `packages/franken-orchestrator/src/beasts/definitions/catalog.ts`
- Create: `packages/franken-orchestrator/src/beasts/definitions/design-interview-definition.ts`
- Create: `packages/franken-orchestrator/src/beasts/definitions/chunk-plan-definition.ts`
- Create: `packages/franken-orchestrator/src/beasts/definitions/martin-loop-definition.ts`
- Create: `packages/franken-orchestrator/src/beasts/services/beast-catalog-service.ts`
- Create: `packages/franken-orchestrator/src/beasts/services/beast-interview-service.ts`
- Create: `packages/franken-orchestrator/tests/unit/beasts/catalog-service.test.ts`
- Create: `packages/franken-orchestrator/tests/unit/beasts/interview-service.test.ts`

**Step 1: Write the failing catalog/interview tests**

Cover:

```ts
expect(service.listDefinitions().map((d) => d.id)).toEqual([
  'design-interview',
  'chunk-plan',
  'martin-loop',
]);
expect(await interview.start('martin-loop')).toMatchObject({ definitionId: 'martin-loop' });
expect(await interview.answer(sessionId, answer)).toMatchObject({ complete: expect.any(Boolean) });
```

**Step 2: Run the focused tests to verify they fail**

Run: `npm --workspace franken-orchestrator test -- tests/unit/beasts/catalog-service.test.ts tests/unit/beasts/interview-service.test.ts`
Expected: FAIL because no Beast catalog or interview service exists

**Step 3: Implement the fixed catalog**

Each definition should declare:

- `id`
- `version`
- `label`
- `description`
- `configSchema`
- `interviewPrompts`
- `executionModeDefault: 'process'`
- `telemetryLabels`

**Step 4: Implement interview session handling**

Persist multi-step interview progress in `beast_interview_sessions`, allowing both CLI and dashboard/chat to answer prompts incrementally.

**Step 5: Re-run the focused tests**

Run: `npm --workspace franken-orchestrator test -- tests/unit/beasts/catalog-service.test.ts tests/unit/beasts/interview-service.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/franken-orchestrator/src/beasts/definitions/catalog.ts \
  packages/franken-orchestrator/src/beasts/definitions/design-interview-definition.ts \
  packages/franken-orchestrator/src/beasts/definitions/chunk-plan-definition.ts \
  packages/franken-orchestrator/src/beasts/definitions/martin-loop-definition.ts \
  packages/franken-orchestrator/src/beasts/services/beast-catalog-service.ts \
  packages/franken-orchestrator/src/beasts/services/beast-interview-service.ts \
  packages/franken-orchestrator/tests/unit/beasts/catalog-service.test.ts \
  packages/franken-orchestrator/tests/unit/beasts/interview-service.test.ts
git commit -m "feat(orchestrator): add fixed beast catalog and interview service"
```

### Task 4: Implement executor interfaces, process execution, and container stub

**Files:**
- Create: `packages/franken-orchestrator/src/beasts/execution/beast-executor.ts`
- Create: `packages/franken-orchestrator/src/beasts/execution/process-supervisor.ts`
- Create: `packages/franken-orchestrator/src/beasts/execution/process-beast-executor.ts`
- Create: `packages/franken-orchestrator/src/beasts/execution/container-beast-executor.ts`
- Create: `packages/franken-orchestrator/tests/unit/beasts/process-beast-executor.test.ts`
- Create: `packages/franken-orchestrator/tests/unit/beasts/container-beast-executor.test.ts`

**Step 1: Write the failing executor tests**

Cover:

```ts
const attempt = await executor.start(run, definition);
expect(attempt.status).toBe('running');
await executor.stop(run, attempt.id);
expect(repo.getRun(run.id)?.status).toBe('stopped');
```

and:

```ts
await expect(containerExecutor.start(run, definition)).rejects.toThrow(/not implemented/i);
```

**Step 2: Run the focused tests to verify they fail**

Run: `npm --workspace franken-orchestrator test -- tests/unit/beasts/process-beast-executor.test.ts tests/unit/beasts/container-beast-executor.test.ts`
Expected: FAIL because Beast executor implementations do not exist

**Step 3: Implement the execution interfaces**

Define a narrow contract for:

- `start(run, definition)`
- `stop(runId, attemptId)`
- `kill(runId, attemptId)`
- `restart(run, definition)`

**Step 4: Implement process execution**

Spawn tracked child processes with:

- explicit cwd
- explicit env allowlist
- stdout/stderr streaming into repository events and log store
- graceful stop then forced kill fallback

**Step 5: Add the container stub**

Return a typed `NOT_IMPLEMENTED` error while preserving the future `executionMode` path.

**Step 6: Re-run the focused tests**

Run: `npm --workspace franken-orchestrator test -- tests/unit/beasts/process-beast-executor.test.ts tests/unit/beasts/container-beast-executor.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add packages/franken-orchestrator/src/beasts/execution/beast-executor.ts \
  packages/franken-orchestrator/src/beasts/execution/process-supervisor.ts \
  packages/franken-orchestrator/src/beasts/execution/process-beast-executor.ts \
  packages/franken-orchestrator/src/beasts/execution/container-beast-executor.ts \
  packages/franken-orchestrator/tests/unit/beasts/process-beast-executor.test.ts \
  packages/franken-orchestrator/tests/unit/beasts/container-beast-executor.test.ts
git commit -m "feat(orchestrator): add beast process executor and container stub"
```

### Task 5: Add dispatch/run services plus telemetry exporters

**Files:**
- Create: `packages/franken-orchestrator/src/beasts/services/beast-dispatch-service.ts`
- Create: `packages/franken-orchestrator/src/beasts/services/beast-run-service.ts`
- Create: `packages/franken-orchestrator/src/beasts/telemetry/beast-metrics.ts`
- Create: `packages/franken-orchestrator/src/beasts/telemetry/prometheus-beast-metrics.ts`
- Create: `packages/franken-orchestrator/src/http/routes/metrics-routes.ts`
- Create: `packages/franken-orchestrator/tests/unit/beasts/beast-dispatch-service.test.ts`
- Create: `packages/franken-orchestrator/tests/unit/beasts/beast-run-service.test.ts`
- Create: `packages/franken-orchestrator/tests/unit/http/metrics-routes.test.ts`

**Step 1: Write the failing service and metrics tests**

Cover:

```ts
const run = await dispatch.createRun(request);
expect(run.dispatchedBy).toBe('dashboard');
expect(run.configSnapshot).toEqual(expect.objectContaining({ mode: 'martin-loop' }));
```

and:

```ts
await runService.stop(run.id, actor);
expect(repo.getRun(run.id)?.status).toBe('stopped');
expect(metricsText).toContain('beast_runs_created_total');
```

**Step 2: Run the focused tests to verify they fail**

Run: `npm --workspace franken-orchestrator test -- tests/unit/beasts/beast-dispatch-service.test.ts tests/unit/beasts/beast-run-service.test.ts tests/unit/http/metrics-routes.test.ts`
Expected: FAIL because dispatch/run services and metrics exporter do not exist

**Step 3: Implement the services**

`BeastDispatchService` should:

- validate the selected definition
- persist immutable config snapshot
- create the run
- auto-start if requested
- record audit/event entries

`BeastRunService` should:

- list runs
- fetch detail
- list attempts
- stream events
- read logs
- start/restart/stop/kill attempts

**Step 4: Implement Prometheus metrics**

Expose counters/gauges/histograms for run creation, active runs, status changes, stop/kill/restart counts, interview completion, and spawn failures.

**Step 5: Re-run the focused tests**

Run: `npm --workspace franken-orchestrator test -- tests/unit/beasts/beast-dispatch-service.test.ts tests/unit/beasts/beast-run-service.test.ts tests/unit/http/metrics-routes.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/franken-orchestrator/src/beasts/services/beast-dispatch-service.ts \
  packages/franken-orchestrator/src/beasts/services/beast-run-service.ts \
  packages/franken-orchestrator/src/beasts/telemetry/beast-metrics.ts \
  packages/franken-orchestrator/src/beasts/telemetry/prometheus-beast-metrics.ts \
  packages/franken-orchestrator/src/http/routes/metrics-routes.ts \
  packages/franken-orchestrator/tests/unit/beasts/beast-dispatch-service.test.ts \
  packages/franken-orchestrator/tests/unit/beasts/beast-run-service.test.ts \
  packages/franken-orchestrator/tests/unit/http/metrics-routes.test.ts
git commit -m "feat(orchestrator): add beast dispatch services and metrics"
```

### Task 6: Add secure and rate-limited Beast HTTP routes

**Files:**
- Create: `packages/franken-orchestrator/src/beasts/http/beast-auth.ts`
- Create: `packages/franken-orchestrator/src/beasts/http/beast-rate-limit.ts`
- Create: `packages/franken-orchestrator/src/http/routes/beast-routes.ts`
- Modify: `packages/franken-orchestrator/src/http/chat-app.ts`
- Modify: `packages/franken-orchestrator/src/http/middleware.ts`
- Test: `packages/franken-orchestrator/tests/integration/beasts/beast-routes.test.ts`
- Test: `packages/franken-orchestrator/tests/integration/beasts/beast-security.test.ts`

**Step 1: Write the failing route/security tests**

Cover:

```ts
await app.request('/v1/beasts/catalog');
expect(response.status).toBe(401);
```

and:

```ts
expect(await authenticatedPost('/v1/beasts/runs')).toBeStatus(201);
expect(await burstPost('/v1/beasts/runs')).toBeStatus(429);
```

**Step 2: Run the focused tests to verify they fail**

Run: `npm --workspace franken-orchestrator test -- tests/integration/beasts/beast-routes.test.ts tests/integration/beasts/beast-security.test.ts`
Expected: FAIL because Beast routes, auth, and rate limit middleware do not exist

**Step 3: Implement auth and authorization middleware**

Support:

- operator API token for CLI/API callers
- short-lived signed session token verification for dashboard
- action-based permission checks

**Step 4: Implement Beast routes**

Add:

- catalog
- create/list/detail runs
- events/logs
- start/stop/kill/restart
- interview start/answer

**Step 5: Mount the routes**

Wire Beast routes and `/metrics` into `createChatApp`.

**Step 6: Re-run the focused tests**

Run: `npm --workspace franken-orchestrator test -- tests/integration/beasts/beast-routes.test.ts tests/integration/beasts/beast-security.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add packages/franken-orchestrator/src/beasts/http/beast-auth.ts \
  packages/franken-orchestrator/src/beasts/http/beast-rate-limit.ts \
  packages/franken-orchestrator/src/http/routes/beast-routes.ts \
  packages/franken-orchestrator/src/http/chat-app.ts \
  packages/franken-orchestrator/src/http/middleware.ts \
  packages/franken-orchestrator/tests/integration/beasts/beast-routes.test.ts \
  packages/franken-orchestrator/tests/integration/beasts/beast-security.test.ts
git commit -m "feat(orchestrator): add secure beast dispatch routes"
```

### Task 7: Add CLI Beast spawn and control commands

**Files:**
- Modify: `packages/franken-orchestrator/src/cli/args.ts`
- Modify: `packages/franken-orchestrator/src/cli/run.ts`
- Create: `packages/franken-orchestrator/src/cli/beast-client.ts`
- Create: `packages/franken-orchestrator/src/cli/beast-prompts.ts`
- Test: `packages/franken-orchestrator/tests/unit/cli/args.test.ts`
- Test: `packages/franken-orchestrator/tests/unit/cli/run.test.ts`
- Test: `packages/franken-orchestrator/tests/unit/cli/beast-prompts.test.ts`

**Step 1: Write the failing CLI tests**

Cover:

```ts
expect(parseArgs(['beasts', 'spawn', 'martin-loop']).subcommand).toBe('beasts');
expect(parseArgs(['beasts', 'restart', 'run-1']).beastAction).toBe('restart');
```

and prompt behavior:

```ts
expect(await collectBeastConfig(io, definition)).toEqual(expect.objectContaining({ provider: 'claude' }));
```

**Step 2: Run the focused tests to verify they fail**

Run: `npm --workspace franken-orchestrator test -- tests/unit/cli/args.test.ts tests/unit/cli/run.test.ts tests/unit/cli/beast-prompts.test.ts`
Expected: FAIL because the CLI does not have a Beast command family

**Step 3: Extend the CLI contract**

Add:

- `frankenbeast beasts catalog`
- `frankenbeast beasts spawn <definition-id>`
- `frankenbeast beasts list`
- `frankenbeast beasts status <run-id>`
- `frankenbeast beasts logs <run-id>`
- `frankenbeast beasts stop <run-id>`
- `frankenbeast beasts kill <run-id>`
- `frankenbeast beasts restart <run-id>`

**Step 4: Implement CLI interview prompts**

Use definition-owned interview metadata so the CLI can ask config questions before dispatch.

**Step 5: Re-run the focused tests**

Run: `npm --workspace franken-orchestrator test -- tests/unit/cli/args.test.ts tests/unit/cli/run.test.ts tests/unit/cli/beast-prompts.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/franken-orchestrator/src/cli/args.ts \
  packages/franken-orchestrator/src/cli/run.ts \
  packages/franken-orchestrator/src/cli/beast-client.ts \
  packages/franken-orchestrator/src/cli/beast-prompts.ts \
  packages/franken-orchestrator/tests/unit/cli/args.test.ts \
  packages/franken-orchestrator/tests/unit/cli/run.test.ts \
  packages/franken-orchestrator/tests/unit/cli/beast-prompts.test.ts
git commit -m "feat(orchestrator): add beast cli dispatch commands"
```

### Task 8: Integrate chat-triggered Beast creation

**Files:**
- Modify: `packages/franken-orchestrator/src/chat/intent-router.ts`
- Modify: `packages/franken-orchestrator/src/chat/turn-runner.ts`
- Create: `packages/franken-orchestrator/src/chat/beast-dispatch-adapter.ts`
- Test: `packages/franken-orchestrator/tests/unit/chat/intent-router.test.ts`
- Test: `packages/franken-orchestrator/tests/unit/chat/beast-dispatch-adapter.test.ts`
- Test: `packages/franken-orchestrator/tests/integration/chat/chat-routes.test.ts`

**Step 1: Write the failing chat tests**

Cover:

```ts
expect(routeIntent('spawn a martin beast')).toEqual(expect.objectContaining({ kind: 'dispatch_beast' }));
```

and:

```ts
expect(result.runId).toMatch(/^run_/);
expect(result.definitionId).toBe('martin-loop');
```

**Step 2: Run the focused tests to verify they fail**

Run: `npm --workspace franken-orchestrator test -- tests/unit/chat/intent-router.test.ts tests/unit/chat/beast-dispatch-adapter.test.ts tests/integration/chat/chat-routes.test.ts`
Expected: FAIL because chat cannot yet dispatch Beast runs

**Step 3: Add a Beast dispatch adapter for chat**

The adapter should:

- map dispatch intent to a Beast definition
- request missing config through chat clarification flow
- create the Beast run through shared services
- return run metadata to the transcript

**Step 4: Wire it into turn execution**

Keep chat transcript state separate from Beast run state.

**Step 5: Re-run the focused tests**

Run: `npm --workspace franken-orchestrator test -- tests/unit/chat/intent-router.test.ts tests/unit/chat/beast-dispatch-adapter.test.ts tests/integration/chat/chat-routes.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/franken-orchestrator/src/chat/intent-router.ts \
  packages/franken-orchestrator/src/chat/turn-runner.ts \
  packages/franken-orchestrator/src/chat/beast-dispatch-adapter.ts \
  packages/franken-orchestrator/tests/unit/chat/intent-router.test.ts \
  packages/franken-orchestrator/tests/unit/chat/beast-dispatch-adapter.test.ts \
  packages/franken-orchestrator/tests/integration/chat/chat-routes.test.ts
git commit -m "feat(orchestrator): allow chat to dispatch beast runs"
```

### Task 9: Build the Beast dispatch station in `franken-web`

**Files:**
- Create: `packages/franken-web/src/pages/beasts-page.tsx`
- Create: `packages/franken-web/src/components/beast-run-table.tsx`
- Create: `packages/franken-web/src/components/beast-launch-panel.tsx`
- Create: `packages/franken-web/src/components/beast-run-detail.tsx`
- Create: `packages/franken-web/src/components/beast-log-panel.tsx`
- Create: `packages/franken-web/src/lib/beast-api.ts`
- Modify: `packages/franken-web/src/app.tsx`
- Modify: `packages/franken-web/src/styles/app.css`
- Test: `packages/franken-web/tests/components/beasts-page.test.tsx`
- Test: `packages/franken-web/tests/lib/beast-api.test.ts`

**Step 1: Write the failing dashboard tests**

Cover:

```tsx
expect(screen.getByText('Dispatch Station')).toBeDefined();
expect(screen.getByRole('button', { name: 'Restart run-1' })).toBeDefined();
expect(screen.getByText('stopped')).toBeDefined();
```

and API client coverage for:

- list catalog
- create run
- list runs
- fetch logs/events
- stop/kill/restart

**Step 2: Run the focused tests to verify they fail**

Run: `npm --workspace @frankenbeast/web test -- tests/components/beasts-page.test.tsx tests/lib/beast-api.test.ts`
Expected: FAIL because Beast UI and Beast API client do not exist

**Step 3: Add the Beast API client**

Follow the existing `network-api.ts` pattern and expose methods for catalog, runs, interviews, logs, events, and control actions.

**Step 4: Build the Beast dispatch page**

The page should include:

- launch/catalog pane
- persistent runs table
- detail panel with config snapshot, attempt history, logs, and timeline
- operator action buttons for start/restart/stop/kill

**Step 5: Re-run the focused tests**

Run: `npm --workspace @frankenbeast/web test -- tests/components/beasts-page.test.tsx tests/lib/beast-api.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/franken-web/src/pages/beasts-page.tsx \
  packages/franken-web/src/components/beast-run-table.tsx \
  packages/franken-web/src/components/beast-launch-panel.tsx \
  packages/franken-web/src/components/beast-run-detail.tsx \
  packages/franken-web/src/components/beast-log-panel.tsx \
  packages/franken-web/src/lib/beast-api.ts \
  packages/franken-web/src/app.tsx \
  packages/franken-web/src/styles/app.css \
  packages/franken-web/tests/components/beasts-page.test.tsx \
  packages/franken-web/tests/lib/beast-api.test.ts
git commit -m "feat(web): add beast dispatch station dashboard"
```

### Task 10: Add end-to-end verification and operator docs

**Files:**
- Create: `packages/franken-orchestrator/tests/integration/beasts/beast-lifecycle.integration.test.ts`
- Create: `packages/franken-orchestrator/tests/integration/beasts/beast-dashboard-api.integration.test.ts`
- Modify: `packages/franken-orchestrator/docs/RAMP_UP.md`
- Modify: `README.md`
- Modify: `frankenbeast.config.example.json`

**Step 1: Write the failing integration tests**

Cover:

```ts
expect(await createRunAndStart()).toMatchObject({ status: 'running' });
expect(await stopRun(runId)).toMatchObject({ status: 'stopped' });
expect(await restartRun(runId)).toMatchObject({ attemptCount: 2 });
expect(await getMetrics()).toContain('beast_run_restarts_total');
```

**Step 2: Run the focused tests to verify they fail**

Run: `npm --workspace franken-orchestrator test -- tests/integration/beasts/beast-lifecycle.integration.test.ts tests/integration/beasts/beast-dashboard-api.integration.test.ts`
Expected: FAIL because the full lifecycle is not wired end-to-end yet

**Step 3: Add docs and example config**

Document:

- Beast CLI usage
- dashboard dispatch station
- API auth configuration
- rate limit settings
- metrics endpoint for Grafana/Prometheus scraping
- process executor vs future container executor

**Step 4: Run the project verifications**

Run: `npm --workspace franken-orchestrator test`
Expected: PASS

Run: `npm --workspace @frankenbeast/web test`
Expected: PASS

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/tests/integration/beasts/beast-lifecycle.integration.test.ts \
  packages/franken-orchestrator/tests/integration/beasts/beast-dashboard-api.integration.test.ts \
  packages/franken-orchestrator/docs/RAMP_UP.md \
  README.md \
  frankenbeast.config.example.json
git commit -m "docs: add beast dispatch operator guidance"
```
