# Hive Brain HTTP routes progress

- [x] Read Kanban task `t_e911bdaf`, issue #3704, ADR-041, route/auth conventions, Brain contracts, and registry ownership.
- [x] Confirm no existing open PR duplicates issue #3704.
- [x] Add a failing BrainRegistry test for existing-only agent lookup, then implement `getAgentType()` without creating unknown databases.
- [x] Add focused failing integration tests for operator auth, summaries, bounded episode pagination/search, unavailable lessons, invalid/missing ids, and safe storage failures.
- [x] Implement `/v1/brain/:agentTypeId`, `/episodes`, and `/lessons` with bounded inputs/results and stable errors.
- [x] Mount routes in the Beast daemon and local chat-server service mode; proxy `/v1/brain/*` when chat-server uses a standalone daemon.
- [x] Add daemon-mount and gateway-proxy regression tests.
- [x] Update ADR-041, architecture/API documentation, deployment guidance, and shared lessons.
- [x] Address independent review findings by bounding every variable-length episodic response field; verify with a 2 MB stored event regression and a clean local Codex review.
- [x] Run orchestrator/brain focused suites plus canonical lint, typecheck, build, and test gates.
- [x] Review the complete diff and resolve independent review findings.
- [ ] Commit, push, open a PR closing #3704, pass CI and Codex review, merge, and close the Kanban task.

## TDD evidence

- BrainRegistry RED: `reader.getAgentType is not a function`.
- Brain route RED: missing `brain-routes.js` module.
- Safe-error RED: expected HTTP 503 but received 500 with the raw storage exception reaching the shared logger.
- Daemon wiring RED: `services.brains` was undefined.
- Gateway wiring RED: `/v1/brain/*` returned 404 instead of proxying.
- Focused GREEN so far: BrainRegistry 10/10, Brain routes 7/7, daemon mount 1/1, gateway proxy 9/9.
- Canonical GREEN: `npm run lint`, `npm run typecheck`, `npm run build`, and `npm run test` (all 10 workspaces). The first full-test run had one unrelated timeout in `dep-factory-providers.test.ts`; the isolated rerun passed in 551 ms and the complete root suite then passed.
