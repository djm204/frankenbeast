# Implementation Plan — Franken Skills / Skill Registry (MOD-02)

Each chunk is independently deployable and rollback-safe. Phases within a chunk have a dependency order; chunks are independent where noted. Every bullet is one atomic commit. Commit order within any phase: test → feat → refactor → docs(adr).

**ADR index** — read these before any non-obvious implementation decision:
- [ADR-0001](docs/adr/0001-typescript-as-implementation-language.md) — TypeScript with strict mode
- [ADR-0002](docs/adr/0002-unified-skill-contract-v1-schema.md) — UnifiedSkillContract v1 schema (required fields, breaking change policy)
- [ADR-0003](docs/adr/0003-cli-subprocess-for-discovery.md) — CLI subprocess over direct npm import for discovery
- [ADR-0004](docs/adr/0004-local-first-precedence.md) — Local skills override global, logged explicitly
- [ADR-0005](docs/adr/0005-in-memory-registry-for-v1.md) — In-memory Map, populated at sync(), read-only after
- [ADR-0006](docs/adr/0006-iskillregistry-as-public-api-boundary.md) — ISkillRegistry exported; concrete class hidden
- [ADR-0007](docs/adr/0007-skill-gen-as-developer-prompt-template.md) — Skill-Gen is a template prompt, never auto-generation

---

## Chunk 1 — Foundation: Types, Schema, Toolchain

**Goal**: Canonical contracts and toolchain. No business logic. Nothing callable yet. Everything else is built on top of what lands here.

**Rollback**: Delete the files. Zero runtime impact.

---

### Phase 1.1 — Project scaffold & toolchain

Mirror MOD-01's toolchain exactly (see ADR-0001).

- `chore(scaffold): init package.json as @franken/skills with ESM, build, test, lint scripts`
- `chore(scaffold): add tsconfig.json — ES2022, NodeNext, strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes`
- `chore(scaffold): add .eslintrc.json — @typescript-eslint strict, no-any, explicit return types`
- `chore(scaffold): add .prettierrc.json and .gitignore`
- `chore(test): add vitest.config.ts — node env, 80% coverage threshold on lines/branches/functions/statements`
- `docs(adr): ADR-0001 — TypeScript as implementation language` *(already committed)*

### Phase 1.2 — UnifiedSkillContract types

See ADR-0002 for required fields and versioning policy.

- `feat(types): define SandboxType enum (DOCKER | WASM | LOCAL)`
- `feat(types): define SkillSource enum (GLOBAL | LOCAL)`
- `feat(types): define UnifiedSkillContract interface — all fields required, no optional`
- `feat(types): define SkillRegistryError shape (code, message, skill_id?)`
- `feat(types): define RawSkillEntry — the unvalidated shape from @djm204/agent-skills --list stdout`
- `test(types): type-level assertions — valid UnifiedSkillContract satisfies interface, missing fields fail`
- `docs(adr): ADR-0002 — UnifiedSkillContract v1 canonical schema` *(already committed)*

### Phase 1.3 — Contract Validator

The gatekeeper. Every skill touches this before registration. Test before implementing.

- `test(validator): PASS — fully valid contract with all required fields`
- `test(validator): FAIL — missing skill_id`
- `test(validator): FAIL — empty string skill_id`
- `test(validator): FAIL — missing metadata.description`
- `test(validator): FAIL — missing interface.input_schema`
- `test(validator): FAIL — missing interface.output_schema`
- `test(validator): FAIL — is_destructive is not boolean (string "true" is rejected)`
- `test(validator): FAIL — requires_hitl is not boolean`
- `test(validator): FAIL — sandbox_type is not a valid SandboxType enum value`
- `test(validator): FAIL — metadata.source is not a valid SkillSource enum value`
- `feat(validator): implement validateSkillContract() — returns Result<UnifiedSkillContract, SkillRegistryError[]>`

---

## Chunk 2 — Discovery Service (Tracer Bullet: CLI → Contract → Validated)

**Goal**: Parse `@djm204/agent-skills --list` stdout into validated `UnifiedSkillContract[]`. This is the tracer bullet — it proves the full discovery pipeline end-to-end before the registry exists to store anything.

**Rollback**: Delete `src/discovery/`. Nothing calls it yet.

**Depends on**: Chunk 1 (types + validator)

---

### Phase 2.1 — ISkillCli interface & CLI adapter

See ADR-0003 for why subprocess over direct import.

- `docs(adr): ADR-0003 — CLI subprocess for discovery` *(already committed)*
- `feat(discovery): define ISkillCli interface — list(): Promise<RawSkillEntry[]>`
- `feat(discovery): implement AgentSkillsCli — spawns npx @djm204/agent-skills --list, parses stdout`
- `test(discovery): AgentSkillsCli.list() returns parsed RawSkillEntry[] from fixture stdout`
- `test(discovery): AgentSkillsCli throws SkillRegistryError(CLI_FAILURE) on non-zero exit code`
- `test(discovery): AgentSkillsCli throws SkillRegistryError(PARSE_ERROR) on malformed JSON stdout`
- `test(discovery): AgentSkillsCli throws SkillRegistryError(CLI_TIMEOUT) on subprocess timeout`

### Phase 2.2 — Discovery Service parser

- `test(discovery): valid RawSkillEntry maps to UnifiedSkillContract with all required fields`
- `test(discovery): RawSkillEntry missing description → validateSkillContract fails, error logged, entry skipped`
- `test(discovery): empty list from CLI → returns empty array (no crash, no error)`
- `test(discovery): two RawSkillEntries with identical skill_id → second logged as error, first kept`
- `feat(discovery): implement DiscoveryService — maps RawSkillEntry[] → UnifiedSkillContract[] via validator`
- `feat(discovery): invalid entries logged with structured error (code, skill_id, failing fields) and skipped`

---

## Chunk 3 — Registry Core

**Goal**: In-memory storage and retrieval. Only validated contracts get in. Precedence resolution for local vs. global.

**Rollback**: Delete `src/registry/`. Discovery service remains intact but unused.

**Depends on**: Chunks 1–2

---

### Phase 3.1 — SkillRegistry (storage + retrieval)

See ADR-0005 for the in-memory decision.

- `docs(adr): ADR-0005 — in-memory registry for v1` *(already committed)*
- `test(registry): register valid contract → retrievable by skill_id via getSkill()`
- `test(registry): register invalid contract → throws SkillRegistryError, registry unchanged`
- `test(registry): getSkill for unknown skill_id → returns undefined`
- `test(registry): getAll() → returns all registered skills as UnifiedSkillContract[]`
- `test(registry): getSkill() before sync() → throws SkillRegistryError(REGISTRY_NOT_SYNCED)`
- `test(registry): isSynced() returns false before sync(), true after`
- `feat(registry): implement SkillRegistry with register(), getSkill(), getAll(), isSynced()`

### Phase 3.2 — Local/global precedence resolution

See ADR-0004 for the local-wins rule and logging requirement.

- `docs(adr): ADR-0004 — local-first precedence with explicit override logging` *(already committed)*
- `test(registry): local skill with same skill_id as global → local registered, global replaced`
- `test(registry): local override is logged at info level with skill_id and local file path`
- `test(registry): invalid local skill does not shadow valid global skill — global survives, error logged`
- `test(registry): two local skills with same skill_id → error logged, first one kept`
- `feat(registry): implement resolveSkills(global[], local[]) — merges with precedence, returns resolved Map`

---

## Chunk 4 — Local Skill Loader

**Goal**: Read the `/skills` directory, validate each file as `UnifiedSkillContract`, return the resolved local set.

**Rollback**: Delete `src/local-loader/`. Registry and discovery remain functional for global skills only.

**Depends on**: Chunk 1 (types + validator)

---

### Phase 4.1 — LocalSkillLoader

- `test(local): valid JSON skill file in /skills → loaded and validated as UnifiedSkillContract`
- `test(local): skill file with missing required field → logs SkillRegistryError, file skipped`
- `test(local): malformed JSON in /skills file → logs SkillRegistryError(PARSE_ERROR), file skipped`
- `test(local): empty /skills directory → returns empty array, no error`
- `test(local): /skills directory does not exist → returns empty array with info-level log`
- `test(local): non-.json files in /skills → silently ignored`
- `feat(local): implement LocalSkillLoader.load(dir) — scans /skills, validates, returns UnifiedSkillContract[]`

---

## Chunk 5 — ISkillRegistry Interface & Public API

**Goal**: Define the interface MOD-01 and MOD-04 will depend on. Export it and the factory. Hide the concrete class.

**Rollback**: Revert `src/index.ts`. All internals remain unchanged.

**Depends on**: Chunks 1–4

---

### Phase 5.1 — ISkillRegistry interface

See ADR-0006 for why the interface, not the class, is the export.

- `docs(adr): ADR-0006 — ISkillRegistry as public API boundary` *(already committed)*
- `feat(registry): define ISkillRegistry interface — hasSkill, getSkill, getAll, sync, isSynced`
- `test(registry): SkillRegistry satisfies ISkillRegistry type constraint`
- `feat(registry): implement createRegistry(config) factory — wires DiscoveryService + LocalSkillLoader + SkillRegistry`
- `feat(index): export ISkillRegistry, UnifiedSkillContract, SkillRegistryError, createRegistry from src/index.ts`
- `test(index): concrete SkillRegistry class is NOT exported from src/index.ts (type test)`

---

## Chunk 6 — Startup Sync & Observability

**Goal**: Wire discovery + local loader + precedence resolution into a single `sync()` call. Log the resolved inventory. This is the integration point — every prior chunk must be green before landing this.

**Rollback**: Revert the sync wiring in `createRegistry`. Components remain independently testable.

**Depends on**: Chunks 1–5

---

### Phase 6.1 — sync() tracer bullet (full end-to-end path)

- `feat(registry): implement sync() — AgentSkillsCli.list() → parse → LocalSkillLoader.load() → resolveSkills() → register all`
- `test(registry): sync() — global + local skills resolved, registry populated, isSynced() → true`
- `test(registry): sync() — local override logged with skill_id and source path`
- `test(registry): sync() — malformed CLI stdout throws SkillRegistryError, registry stays empty (not partial)`
- `test(registry): sync() — invalid local file skipped, valid globals still registered`
- `test(registry): sync() called twice — second call replaces registry state cleanly (idempotent)`

### Phase 6.2 — Startup inventory logging

- `feat(observability): after sync(), log one entry per registered skill at debug level`
- `feat(observability): log fields: skill_id, source (GLOBAL|LOCAL), is_destructive, requires_hitl, sandbox_type`
- `feat(observability): skills that are local overrides get an additional `override: true` flag in the log entry`
- `test(observability): debug log written once per skill after sync() — correct field values`
- `test(observability): override flag present in log for locally-overriding skills only`

---

## Chunk 7 — Skill-Gen Scaffold

**Goal**: When a skill is missing, alert the developer with a conservative, valid contract skeleton. Never auto-generate or auto-execute.

**Rollback**: Remove `src/scaffold/` and the `getSkill()` hook. No functional regression.

**Depends on**: Chunk 5 (ISkillRegistry interface)

---

### Phase 7.1 — SkillGenScaffold

See ADR-0007 for the template-only, no-auto-generation decision.

- `docs(adr): ADR-0007 — Skill-Gen as developer prompt template` *(already committed)*
- `test(scaffold): scaffold for unknown skill_id → returns valid UnifiedSkillContract skeleton with skill_id pre-filled`
- `test(scaffold): scaffold skeleton passes structural validation (all required keys present)`
- `test(scaffold): scaffold defaults — is_destructive: true, requires_hitl: true, sandbox_type: DOCKER`
- `test(scaffold): scaffold emits structured alert log — skill_id and instructions to fill in /skills`
- `feat(scaffold): implement SkillGenScaffold.generate(skill_id) — builds contract skeleton with conservative defaults`
- `feat(registry): hook SkillGenScaffold into getSkill() — when undefined, generate and log scaffold, still return undefined`

---

## Chunk 8 — Hardening & Integration Tests

**Goal**: Non-functional correctness. Everything works; now prove it holds at scale and under adversarial conditions.

**Rollback**: Each phase is additive. Removing tests doesn't break functional behavior.

**Depends on**: Chunk 6

---

### Phase 8.1 — Registry integrity

- `test(registry): sync() with 0 global skills and 0 local skills — empty registry, no error, isSynced() → true`
- `test(registry): getAll() on empty registry → returns empty array (not undefined, not error)`
- `test(registry): hasSkill() returns true for registered skill, false for unknown`

### Phase 8.2 — Performance baseline

- `test(perf): sync() with 100 skills completes in <200ms (subprocess mocked)`
- `test(perf): getSkill() with 1000 registered skills returns in <1ms`
- `test(perf): getAll() with 1000 registered skills completes in <5ms`

### Phase 8.3 — Integration tests (full flow)

- `test(integration): createRegistry + sync() + hasSkill() — end-to-end with fixture CLI output and local fixture /skills dir`
- `test(integration): local override of global skill — correct version returned, override logged`
- `test(integration): missing skill triggers scaffold — alert logged, undefined returned, registry unchanged`
- `test(integration): two sync() calls — registry reflects latest CLI output (stale entries removed)`

---

## Rollback Reference

| Chunk | Safe to remove | Dependencies lost |
| :---- | :------------- | :---------------- |
| 1 | No — do not remove | Foundation for everything |
| 2 | Yes (delete src/discovery/) | Chunk 6 sync() |
| 3 | Yes (delete src/registry/) | Chunks 5, 6, 7 |
| 4 | Yes (delete src/local-loader/) | Local skill support in Chunk 6 |
| 5 | Revert src/index.ts | MOD-01 integration surface |
| 6 | Revert sync() wiring | Chunk 8 integration tests |
| 7 | Yes (delete src/scaffold/) | Nothing functional |
| 8 | Per-phase (additive) | Nothing functional |

---

## Commit Order Within Any Phase

1. `test(...)` — failing test(s) first
2. `feat(...)` — implementation that makes them pass
3. `refactor(...)` — clean up, must stay green
4. `docs(adr): ...` — if a non-obvious decision emerged during implementation

Never invert steps 1 and 2. A `feat` commit with no preceding `test` commit is a TDD violation.
