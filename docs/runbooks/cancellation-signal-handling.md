# Cancellation and signal-handling semantics

Frankenbeast worker loops treat cancellation as a retryable, non-successful terminal path. A cancelled worker must not claim a promise tag as completed, append final assistant output to the managed chunk session, or leave a provider child process running.

## Cancellation points

- Setup: if the `AbortSignal` is already aborted before the provider process is spawned, the loop rejects with the abort reason and does not start a child process.
- Provider/tool execution: if cancellation arrives while a CLI provider is running, the loop sends `SIGTERM` to the child. If the process does not exit, the normal escalation path sends `SIGKILL` after the grace period.
- Waits: retry, backoff, quota, or approval-style waits use abort-aware sleeps. Cancelling the signal rejects the wait instead of silently resuming or starting another provider attempt.
- Log write/iteration callbacks: if cancellation is observed after an iteration callback, the loop exits with the abort reason before persisting assistant iteration output or marking a promise-tagged iteration complete.

## State expectations

Cancelled runs should be reported as cancelled/aborted by their caller and retried or cleaned up by the owning scheduler. Existing setup metadata may remain so operators can diagnose the attempted work, but final output/session state must not make the cancelled iteration look successful.

Temporary process resources are cleaned best-effort: child processes receive `SIGTERM`, then `SIGKILL` if needed, and abort listeners are removed when sleeps or provider executions settle.
