# ADR-0004 — Local-First Precedence with Explicit Override Logging

**Status**: Accepted

## Context

Two skill sources can provide a skill with the same `skill_id`: the global `@djm204/agent-skills` package and the project-local `/skills` directory. The system must have a deterministic, auditable rule for which one wins.

Options:
- **Global wins**: Safer by default, but prevents project customization without forking the global package.
- **Local wins**: Enables per-project overrides, which is the primary use case for having a `/skills` directory at all.
- **Conflict = error**: Forces the developer to resolve every overlap. Too strict — the override pattern is intentional and common.

## Decision

Local skills always win. A local skill in `/skills` with the same `skill_id` as a global skill replaces the global one in the resolved registry.

This override is **never silent**. Every local override is logged at `info` level with:
- The overriding `skill_id`
- The source path of the local skill file
- The global package version it is overriding

An invalid local skill (one that fails `validateSkillContract()`) does **not** shadow the valid global skill. The invalid local skill is logged as an error and skipped; the global skill remains registered. A bad local file must not silently remove a valid global capability.

## Consequences

- Developers can customize skills per-project without modifying the global package — the primary design intent of the `/skills` directory
- Every override is auditable in the startup log. No surprises about which version of a skill is running
- An invalid local override does not cause capability regression — the global skill survives
- The override log is a mandatory output, not a debug flag. It cannot be silenced
- `skill_id` uniqueness is enforced within each source before merging. Two global skills with the same `skill_id` is a package bug; two local skills with the same `skill_id` is a developer error — both are logged as errors
