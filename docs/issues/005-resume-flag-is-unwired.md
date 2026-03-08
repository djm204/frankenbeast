# Issue: `--resume` Is Parsed And Documented But Has No Behavior

Severity: medium
Area: `franken-orchestrator` CLI

## Summary

The CLI advertises `--resume`, but the flag is not consumed anywhere after argument parsing.

## Intended Behavior

`frankenbeast run --resume` should select a distinct resume path or change execution semantics in a user-visible way.

## Current Behavior

- `args.ts` parses `resume` and the usage text documents it.
- There is no downstream use of `resume` in `run.ts`, `session.ts`, or `dep-factory.ts`.

## Evidence

- `franken-orchestrator/src/cli/args.ts:17-18`
- `franken-orchestrator/src/cli/args.ts:45-56`
- `franken-orchestrator/src/cli/args.ts:87-114`
- `docs/ARCHITECTURE.md:55-56`
- `docs/RAMP_UP.md:127-128`

## Impact

- The CLI surface is misleading.
- Users cannot tell whether they are resuming intentionally or just relying on implicit checkpoint behavior.

## Acceptance Criteria

- Either implement real resume semantics and surface them in status/logging, or remove the flag and related docs.
- Add a CLI test that proves `--resume` changes behavior.
