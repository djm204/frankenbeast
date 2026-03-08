# franken-skills (MOD-02) -- Agent Ramp-Up

Canonical skill registry for the Frankenbeast agentic system. Every capability the agent can invoke must be registered here as a `UnifiedSkillContract` before the Firewall (MOD-01) permits execution.

## Directory Structure

```
src/
  index.ts              # Public API re-exports (6 exports total)
  types/                # Core types: UnifiedSkillContract, SandboxType, SkillSource, RawSkillEntry, SkillRegistryError
  registry/             # ISkillRegistry interface, SkillRegistry impl, createRegistry() factory
  discovery/            # DiscoveryService + AgentSkillsCli (shells out to npx @djm204/agent-skills --list)
  local-loader/         # LocalSkillLoader - reads .json files from a /skills directory
  validator/            # validateSkillContract() - hand-rolled validation (no zod)
  scaffold/             # SkillGenScaffold - generates skeleton contracts for missing skills
docs/adr/               # 7 ADRs (language choice, contract schema, CLI discovery, local precedence, etc.)
```

## Public API (from src/index.ts)

```ts
// Types (exported as type-only)
ISkillRegistry          // interface: hasSkill, getSkill, getAll, sync, isSynced
UnifiedSkillContract    // the canonical skill shape
SkillRegistryErrorCode  // union: "INVALID_CONTRACT" | "REGISTRY_NOT_SYNCED" | "CLI_FAILURE" | "CLI_TIMEOUT" | "PARSE_ERROR" | "DUPLICATE_SKILL_ID"
RegistryConfig          // { localSkillsDir?: string; cliTimeoutMs?: number }

// Values
SkillRegistryError      // Error subclass with .code and optional .skill_id
createRegistry(config?: RegistryConfig): ISkillRegistry  // factory -- the primary entry point
```

## Key Interfaces

```ts
interface ISkillRegistry {
  hasSkill(id: string): boolean;
  getSkill(id: string): UnifiedSkillContract | undefined;
  getAll(): UnifiedSkillContract[];
  sync(): Promise<void>;   // must call before any reads
  isSynced(): boolean;
}

interface UnifiedSkillContract {
  skill_id: string;
  metadata: { name: string; description: string; source: "GLOBAL" | "LOCAL" };
  interface: { input_schema: Record<string, unknown>; output_schema: Record<string, unknown> };
  constraints: { is_destructive: boolean; requires_hitl: boolean; sandbox_type: "DOCKER" | "WASM" | "LOCAL" };
}
```

## Gotchas

1. **Must call `sync()` before reads.** `getSkill()`, `getAll()`, `hasSkill()` all throw `SkillRegistryError("REGISTRY_NOT_SYNCED")` if `sync()` hasn't been awaited.
2. **`getSkill()` triggers scaffold on miss.** When a skill is not found, `ManagedSkillRegistry.getSkill()` calls `SkillGenScaffold.generate()` which logs a warning with a skeleton template. It still returns `undefined`.
3. **Local overrides global by `skill_id`.** A LOCAL skill with the same `skill_id` as a GLOBAL one wins. Logged explicitly, never silent.
4. **Non-LOCAL duplicates are ignored.** If two GLOBAL skills share a `skill_id`, first one wins. Same for two LOCAL skills.
5. **`sync()` clears and re-populates.** Calling `sync()` again wipes the store first -- stale skills don't persist.
6. **Validation is hand-rolled** (not zod). `validateSkillContract(raw: unknown)` returns `{ ok: true, value } | { ok: false, errors }`.
7. **Scaffold defaults are conservative**: `is_destructive: true`, `requires_hitl: true`, `sandbox_type: "DOCKER"`.
8. **No runtime deps.** Only devDependencies (vitest, typescript, eslint, prettier). Zero production dependencies.

## How Skill Discovery Works

```
createRegistry(config?)
  |
  v
sync()
  |-- AgentSkillsCli.list()          --> shells out: npx @djm204/agent-skills --list
  |   |-> JSON.parse(stdout) -> RawSkillEntry[]
  |   |-> DiscoveryService.discover() validates each entry -> UnifiedSkillContract[]  (globals)
  |
  |-- LocalSkillLoader.load(dir)     --> reads *.json from localSkillsDir (default: cwd/skills)
  |   |-> validates each file -> UnifiedSkillContract[]  (locals)
  |
  |-> SkillRegistry.resolveSkills(globals, locals)  --> local-first merge
  |-> registers all into internal Map<skill_id, UnifiedSkillContract>
  |-> markSynced()
```

Internal interfaces: `ISkillCli { list(): Promise<RawSkillEntry[]> }` abstracts the CLI boundary for testing.

## Build and Test

```bash
npm run build         # tsc
npm run test          # vitest run
npm run test:watch    # vitest (watch mode)
npm run test:coverage # vitest run --coverage
npm run typecheck     # tsc --noEmit
npm run lint          # eslint
```

Test runner: **Vitest**. Tests are colocated (e.g., `skill-registry.test.ts` next to `skill-registry.ts`). CLI boundary is mocked via `ISkillCli` -- never calls `npx` in tests. Fixtures in `discovery/fixtures/` and `local-loader/fixtures/`.

## Position in Frankenbeast

- **Upstream**: `@djm204/agent-skills` npm package (external CLI), local `/skills/*.json` files
- **Downstream consumers**: franken-planner (MOD-04) queries available skills; frankenfirewall (MOD-01) validates that invoked skills satisfy their declared constraints (`is_destructive`, `requires_hitl`, `sandbox_type`)
- **Package**: `@franken/skills` v0.1.0 -- ESM, Node >=18, no production dependencies
