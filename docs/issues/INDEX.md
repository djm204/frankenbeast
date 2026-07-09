# Issue Index

Generated from the 2026-03-08 codebase audit.

> **Historical archive notice (2026-07-09):** This index points at issue writeups generated from the pre-consolidation 2026-03 audit. They are retained as historical evidence, not as the active backlog. Several entries intentionally mention removed package names (`franken-mcp`, `frankenfirewall`, `franken-comms`, `franken-heartbeat`) or obsolete root automation (`test:all`, directory-changing shell loops); rely on each status annotation, current GitHub issues, and the live root Turbo scripts for current work.

> **Status annotations added 2026-07-04** after re-verifying each issue against the live code.

1. `001-cli-config-surface-not-applied.md` — **PARTIALLY FIXED** (config flows into BeastLoop; budgets enforced; provider default honored; provider-override `extraArgs` are still dropped in the main execution path — `CliLlmAdapter.execute()` calls `buildArgs()` without them)
2. `002-plan-mode-drops-chunk-metadata.md` — **FIXED** (plan mode writes rich `ChunkDefinition`s via `ChunkFileWriter`)
3. `003-cli-safety-pipeline-still-stubbed.md` — **FIXED** (real critique/governor wired fail-closed; stubs only behind `FRANKENBEAST_ALLOW_MISSING_SAFETY_MODULES=1`)
4. `004-cli-uses-synthetic-skill-registry-and-no-mcp.md` — **PARTIALLY FIXED** (real `SkillManager` wired; MCP dispatch still unreachable — open issue [#21](https://github.com/djm204/frankenbeast/issues/21))
5. `005-resume-flag-is-unwired.md` — **FIXED** (ADR-033: cold runs clear checkpoints; `--resume` fails fast without one)
6. `006-interview-and-plan-leak-trace-viewer-resources.md` — **FIXED** (`finalize()` in `finally` blocks; GH issue #23 closed)
7. `007-heartbeat-cli-is-stub-backed.md` — **OBSOLETE** (franken-heartbeat package removed per ADR-031)
8. `008-franken-mcp-public-api-and-registry-are-incomplete.md` — **OBSOLETE** (franken-mcp removed; superseded by `@franken/mcp-suite`)
9. `009-root-build-and-test-scripts-skip-mcp-and-break-on-failure.md` — **FIXED** (root scripts run via turbo)
10. `010-root-typecheck-is-red-and-docs-claim-green.md` — **RESOLVED** (offending package deleted; PROGRESS.md reconciled 2026-07-04)
11. `011-firewall-exports-unimplemented-adapters.md` — **OBSOLETE** (frankenfirewall removed per ADR-031)
12. `012-observer-trace-server-tests-require-real-socket-binding.md` — **STILL OPEN** (TraceServer binds all interfaces — open issue [#29](https://github.com/djm204/frankenbeast/issues/29))
13. `013-frankenfirewall-build-script-fails.md` — **OBSOLETE** (package removed)
14. `014-franken-mcp-build-script-fails.md` — **OBSOLETE** (package removed)
