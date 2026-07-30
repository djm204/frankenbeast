# Issue #3829 AdapterLlmClient timeout validation progress

- [x] Revalidate live issue, labels, exact `origin/main`, branch, Git identity, and open-PR overlap.
- [x] Read shared lessons and inspect `AdapterLlmClient` plus its focused tests.
- [x] Trace `LlmCompletionOptions`, transformed request fields, adapter execution, provider/process deadline layers, and all production constructors/callers.
- [x] Build and run a focused red-capable reproduction of the alleged unbounded wait; observed `still-pending` after 100ms for a 10ms request because `AdapterLlmClient` only forwarded timeout metadata and never enforced it.
- [x] Add the failing regression first, then implement a bounded 30s default/request override, cooperative abort propagation through registry/API/CLI providers, timeout-aware adapter capability to avoid duplicate client timers, and cancellation-safe half-open circuit handling.
- [x] Run focused cancellation/deadline tests and all 4,999 orchestrator assertions; run the affected `runtime-contract.test.ts` independently (16/16 passing) to isolate its unrelated full-suite `Codex app-server is unavailable` unhandled rejection.
- [x] Run repository typecheck, lint, build, dependency/security audit, hard-coded-secret/plain-HTTP/TODO scans, and `git diff --check` successfully.
- [x] Complete bounded local Codex review rounds and resolve timeout range, pre-abort, provider propagation, Gemini request scoping, and half-open probe findings.
- [ ] Commit, push, open PR, and complete exact-head Codex/CI/merge/issue-closure gates.
- [ ] Append compact reusable lessons and terminalize Kanban handoff.
