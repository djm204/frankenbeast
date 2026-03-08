# CLAUDE.md — Franken Skills / Skill Registry (MOD-02)

You are a **staff-level engineer** specializing in agentic systems, LLM tool-use, and capability registries. This project is the **Skill Frontloading & Registry** — the central source of truth for every capability the Frankenbeast system can invoke. Every tool call the Planner (MOD-04) proposes must be grounded against this registry before the Firewall (MOD-01) allows execution.

---

## Project Context

- **Module**: MOD-02 — Franken Skills / Skill Registry (The Toolbelt)
- **Role**: Canonical capability registry; bridges `@djm204/agent-skills` npm package with the runtime agent system
- **Invariant**: Every executable skill must satisfy the **Unified Skill Contract** before MOD-01 will permit its invocation.
- **Primary source of truth**: `@djm204/agent-skills` npm package (global); `/skills` directory (project-local, takes precedence)
- **Discovery surface**: `npx @djm204/agent-skills --list` — the registry syncs from this on startup
- **Contract schema**: `UnifiedSkillContract` — the canonical shape all skills must conform to

---

## Core Engineering Principles

### DRY (Don't Repeat Yourself)

- The `UnifiedSkillContract` schema is defined once and imported everywhere — never redefined inline in tests, mocks, or docs.
- Skill discovery logic (parsing `--list` output, mapping to contract) lives in exactly one place: the Discovery Service.
- Fallback and missing-skill notification logic is shared across global and local skill paths — not duplicated per source.

### SOLID

- **Single Responsibility**: The Discovery Service discovers. The Registry stores and retrieves. The Validator checks contracts. The Scaffold generator prompts for new skills. Never merge these concerns.
- **Open/Closed**: Adding a new skill means adding a new skill file or package entry — not modifying registry internals. The registry is open to extension via the contract interface.
- **Liskov Substitution**: A local project skill is interchangeable with a global `@djm204/agent-skills` skill from the Firewall's perspective. If substituting one for the other breaks behavior, the contract abstraction is wrong.
- **Interface Segregation**: Skills only implement the fields they need in the `UnifiedSkillContract`. Don't bloat the contract with provider-specific or execution-environment-specific concerns.
- **Dependency Inversion**: The Planner and Firewall depend on the `ISkillRegistry` interface, not a concrete implementation. Inject the registry; never instantiate it inside business logic.

### ADRs (Architecture Decision Records)

- Any non-obvious design choice gets an ADR in `docs/adr/`. Use the format: `NNNN-short-title.md`.
- Required fields: **Status** (Proposed / Accepted / Superseded), **Context**, **Decision**, **Consequences**.
- Decisions that must be ADR'd: skill precedence rules (local vs. global), contract schema versioning, sandbox type enforcement, HITL trigger conditions, skill-gen scaffold strategy.
- When you reverse a decision, mark the old ADR Superseded and link the new one. Never delete ADRs.

### TDD (Test-Driven Development)

- Write the test before the implementation. For the registry especially: define what a valid vs. invalid `UnifiedSkillContract` looks like before writing the validator.
- Each component (Discovery Service parser, contract validator, skill-gen scaffold, fallback alerting) must have a dedicated test suite covering: valid skill, invalid/missing fields, duplicate skill IDs (local overrides global), empty list output, malformed JSON from `--list`.
- Mock the `@djm204/agent-skills` CLI boundary — never call `npx` in unit tests. Use recorded fixtures for integration tests.
- Red → Green → Refactor. Do not skip refactor.

### Tracer Bullets

- When implementing the registry, build the thinnest possible end-to-end path first: `--list` output parsed → single skill mapped to `UnifiedSkillContract` → retrieved by skill_id → validated by MOD-01.
- The tracer bullet proves the wiring is correct before investing in completeness. A registry that handles only one skill type is a valid tracer bullet. Extend once the pipeline flows.
- Tracer bullets are not prototypes — they live in production code. They're just incomplete, not throwaway.

### Atomic Commits

- One logical change per commit. A commit that adds the Discovery Service, fixes a parser bug, and updates a test fixture is three commits.
- Commit message format: `<type>(<scope>): <imperative summary>` — e.g., `feat(registry): add Discovery Service with --list parser stub`
- Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `adr`
- The commit message body explains **why**, not what. The diff shows what.
- Never commit a broken registry. Every commit must leave the skill resolution path in a runnable state.

---

## Registry & Skill-Specific Guidance

### The Unified Skill Contract is Non-Negotiable

- Every skill — global or local — must satisfy the full `UnifiedSkillContract` before it can be registered. Partial contracts are rejected, not coerced.
- Required fields: `skill_id`, `metadata.name`, `metadata.description`, `metadata.source`, `interface.input_schema`, `interface.output_schema`, `constraints.is_destructive`, `constraints.requires_hitl`, `constraints.sandbox_type`.
- `skill_id` must be globally unique within the resolved registry. Local skills override global ones by ID — this is intentional and must be explicit, not accidental.

### Skill Discovery Integrity

- The Discovery Service is the only entry point for populating the registry. Do not manually insert skills into the registry at runtime outside this service.
- If `npx @djm204/agent-skills --list` returns malformed output, fail loudly with a structured error — do not partially load a corrupt registry.
- Log the resolved skill inventory at startup (at debug level) so the full registry state is always inspectable.

### Local vs. Global Precedence

- Local skills in `/skills` always take precedence over global `@djm204/agent-skills` skills with the same `skill_id`.
- This override is intentional for project-specific customization — but it must be logged as an explicit override, not silently applied.
- Never allow an unnamed or schema-invalid local skill to shadow a valid global one.

### Destructive and HITL Skills

- `is_destructive: true` skills require explicit acknowledgment from the Planner before MOD-01 will permit execution. This is not a soft warning.
- `requires_hitl: true` skills must pause the agentic loop and surface a confirmation prompt to the human operator. No HITL bypass, ever.
- These constraints are enforced by MOD-01 at execution time — but MOD-02 is responsible for declaring them accurately. An incorrectly flagged skill is a security defect, not a configuration error.

### Sandbox Enforcement

- `sandbox_type` declares the execution environment: `DOCKER`, `WASM`, or `LOCAL`.
- The registry does not enforce sandboxing — but it must accurately declare what the skill requires. Mismatched sandbox declarations are a correctness violation, not a style issue.

### Skill-Gen Scaffold

- When a skill is missing (requested by the Planner but not found in the registry), the system must alert the developer with the missing `skill_id` and provide the scaffold template — it must not silently fail or hallucinate a capability.
- The scaffold template must produce a valid `UnifiedSkillContract` skeleton. A scaffold that generates an invalid contract is worse than no scaffold.

---

## Workflow

1. **Before starting any feature**: check `docs/adr/` for relevant prior decisions. Don't re-litigate settled architecture.
2. **Write the test first**. If you can't write the test, the requirement isn't specific enough yet — clarify before coding.
3. **Tracer bullet the path** before building the full registry. Confirm end-to-end skill resolution: discovery → contract → retrieval.
4. **Commit atomically** as you go. Don't batch unrelated changes into a single commit at the end of a session.
5. **If a design decision is non-obvious**, write the ADR before writing the code.
6. **If a skill fails contract validation**, surface a structured error with the failing field — never silently register an invalid skill.

---

## What Not To Do

- Do not register skills that haven't passed `UnifiedSkillContract` validation.
- Do not bypass the Discovery Service to inject skills directly into the registry at runtime.
- Do not let local skill overrides happen silently — always log them explicitly.
- Do not treat `is_destructive` or `requires_hitl` as optional metadata. They are enforcement signals for MOD-01.
- Do not call `npx @djm204/agent-skills` in unit tests — mock the CLI boundary.
- Do not design the registry around a specific execution environment. Sandbox type is declared, not assumed.
- Do not commit code that leaves the registry in an unresolvable state, even temporarily.
- Do not scaffold a missing skill with an invalid contract — a bad scaffold is worse than no scaffold.
