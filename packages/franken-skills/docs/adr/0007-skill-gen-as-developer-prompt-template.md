# ADR-0007 — Skill-Gen as Developer Prompt Template (Not Auto-Generation)

**Status**: Accepted

## Context

When the Planner requests a skill that doesn't exist in the registry, the system must respond. Options:

**Option A — Auto-generate**: Use an LLM to generate a skill implementation on the fly. Fast, but produces unvetted code that bypasses the contract validation pipeline and creates a security surface.

**Option B — Fail hard**: Return a `SkillRegistryError` and halt. Safe, but provides no guidance. Developers hit a wall with no path forward.

**Option C — Developer prompt template**: Alert the developer that a skill is missing, emit a valid `UnifiedSkillContract` skeleton pre-filled with the requested `skill_id`, and surface it as a structured output the developer must complete and commit.

## Decision

Option C. When `getSkill(id)` returns `undefined`, the `SkillGenScaffold` produces:

1. A structured alert: `Skill [skill_id] not found in registry. Add it to complete this capability.`
2. A `UnifiedSkillContract` skeleton with:
   - `skill_id` pre-filled with the requested ID
   - Placeholder strings for `metadata.name`, `metadata.description`
   - Empty JSON Schema objects for `input_schema` and `output_schema` with a `TODO` comment
   - Conservative defaults: `is_destructive: true`, `requires_hitl: true`, `sandbox_type: "DOCKER"`
   - `metadata.source: "LOCAL"` — scaffolded skills go in `/skills`, not the global package

The scaffold output is written to `stdout` (or the observability log) — not auto-committed, not auto-executed. A human must fill it in, validate it, and commit it.

Conservative defaults (`is_destructive: true`, `requires_hitl: true`) are intentional: a scaffold that ships with permissive defaults is a security defect waiting for someone to forget to tighten it.

## Consequences

- Auto-generation is permanently off the table for v1. An LLM-generated skill that hasn't been reviewed is an untrusted code path, which is exactly what MOD-01 exists to prevent.
- Developers get a valid starting point — the scaffold passes the contract structure check once TODOs are filled in, preventing wasted iteration on schema errors.
- Conservative defaults mean a developer must consciously opt out of HITL and destructive flags, not accidentally leave them on.
- The scaffold is a side-effect of `getSkill()` returning `undefined` — it does not change registry state. The missing skill remains missing until the developer creates and commits it.
- Future enhancement: the scaffold could be written directly to `/skills/<skill_id>.json` as a draft file. This would be a backwards-compatible addition — no ADR change required.
