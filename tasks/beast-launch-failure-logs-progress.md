# Beast launch failure log capture progress

- [x] Trace the deployment request through process launch, Pulse ingestion, and log persistence.
- [x] Reproduce the missing-log failure with a focused automated test.
- [x] Confirm the root cause and compare with working process-log capture paths.
- [x] Implement immediate stdout/stderr capture for attempted beast launches, including startup failures.
- [x] Verify focused tests and relevant typecheck/build gates.
- [x] Review the final diff and document any remaining limitations.

## Verification note

- All 4,976 orchestrator tests passed. The full command still exited non-zero because an unrelated Codex app-server availability rejection was reported after the tests; its isolated 16-test runtime contract suite passed.
