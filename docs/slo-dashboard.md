# Availability SLO Dashboard

The local dashboard includes an SLO panel that turns existing Kanban run state into service-level indicators for operator health checks. It is exposed in the `/api/dashboard` snapshot under `slo` and rendered in the dashboard as **SLO dashboard**.

## Data sources

The dashboard is read-only. It uses the Hermes Kanban SQLite database at `HERMES_KANBAN_DB` when set, otherwise `${HERMES_HOME:-~/.hermes}/kanban.db`.

Current inputs:

- `tasks`: task creation, start, closeout time, and current task status.
- `task_runs`: run start/end state, terminal outcomes, and error text.
- `task_events`: worker spawn, heartbeat/comment/block/complete signals, and approval/HITL block/unblock pairs.

If a source table is unavailable, the panel still renders and marks affected metrics as `unknown` rather than failing the whole dashboard.

## Metrics and target SLOs

The report is calculated for 1 hour, 24 hours, and 7 days. The dashboard displays the 1-hour window first so operators see acute degradation quickly.

| Metric | Target | Interpretation |
| --- | --- | --- |
| Run success rate | >= 95% | Completed terminal runs divided by all terminal Kanban runs. Breaches usually point at runtime, CI, provider, or review-gate instability. |
| Time to first output p50 | <= 5 minutes | Median time from run start to first heartbeat/comment/block/completion signal. Breaches mean workers are slow to produce visible liveness. |
| Time to merge/closeout p50 | <= 24 hours | Median time from task creation to done/completed closeout. Breaches mean issue/PR closeout is slowing. |
| Provider wait p50 | <= 2 minutes | Median time from run claim/start to worker-spawn signal. Breaches usually indicate provider, dispatcher, or process-start contention. |
| Queue age p50 | <= 15 minutes | Median time from task creation to first start/claim. Breaches indicate insufficient capacity or blocked dispatch. |
| Approval latency p50 | <= 1 hour | Median time from approval/HITL block to unblock decision. Breaches indicate human approval bottlenecks. |

Metric status values:

- `ok`: the metric satisfies the SLO target.
- `warning`: the metric is within the near-breach band (within 10% below success-rate target or within 25% over latency target).
- `breach`: the metric exceeds the breach threshold.
- `unknown`: there was not enough data in the window.

## Failure categories

Failed or blocked terminal runs are normalized for trend charts into broad categories:

- `approval`: approval/HITL/human gate blockers.
- `provider`: model/provider/quota/rate-limit failures.
- `ci`: test, typecheck, lint, or build failures.
- `github`: GitHub/PR/merge failures.
- `timeout`: timeout, stale, or reclaim-style failures.
- `runtime`: crashes, exceptions, and generic runtime errors.
- `other`: anything not confidently mapped.

Use failure categories as triage pointers, not as definitive root cause. Drill into task runs and comments before taking destructive remediation.
