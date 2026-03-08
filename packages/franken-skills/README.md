# @franken/skills — MOD-02 Skill Registry

The canonical skill registry for the [Frankenbeast](https://github.com/djm204) agentic system. Bridges the `@djm204/agent-skills` package with the runtime agent pipeline, enforces the **Unified Skill Contract** on every capability before it can be invoked, and exposes a stable `ISkillRegistry` interface consumed by the Firewall (MOD-01) and Planner (MOD-04).

---

## What it does

- **Discovers** global skills from `@djm204/agent-skills --list` at startup
- **Loads** project-local overrides from a `/skills` directory
- **Validates** every skill against the `UnifiedSkillContract` schema — invalid skills are logged and skipped, never silently registered
- **Resolves** local-vs-global precedence: local skills win, overrides are logged explicitly
- **Scaffolds** a conservative contract template when a requested skill is missing — no auto-generation, no silent failure
- **Exposes** `ISkillRegistry` as the integration surface for MOD-01's `DeterministicGrounder`

---

## Installation

```bash
npm install @franken/skills
```

---

## Usage

```ts
import { createRegistry } from "@franken/skills";

const registry = createRegistry({
  localSkillsDir: "./skills",   // optional, defaults to process.cwd()/skills
  cliTimeoutMs: 15_000,         // optional, defaults to 15s
});

await registry.sync();          // discovers global + local skills, resolves precedence

registry.hasSkill("deploy-to-vercel"); // true / false
registry.getSkill("deploy-to-vercel"); // UnifiedSkillContract | undefined
registry.getAll();                     // UnifiedSkillContract[]
```

`createRegistry()` returns an `ISkillRegistry` — the concrete implementation is not exported. Call `sync()` once before any queries; calls to `getSkill()`, `getAll()`, or `hasSkill()` before sync throw `SkillRegistryError(REGISTRY_NOT_SYNCED)`.

---

## The Unified Skill Contract

Every skill — global or local — must satisfy this schema to be registered:

```ts
interface UnifiedSkillContract {
  skill_id: string;                    // globally unique identifier
  metadata: {
    name: string;                      // human-readable name
    description: string;               // high-clarity purpose for LLM routing
    source: "GLOBAL" | "LOCAL";        // origin
  };
  interface: {
    input_schema: Record<string, unknown>;   // JSON Schema for tool call arguments
    output_schema: Record<string, unknown>;  // JSON Schema for return value
  };
  constraints: {
    is_destructive: boolean;           // if true, MOD-01 requires Planner acknowledgment
    requires_hitl: boolean;            // if true, pipeline pauses for human confirmation
    sandbox_type: "DOCKER" | "WASM" | "LOCAL";
  };
}
```

All fields are required. Partial contracts are rejected — not coerced.

---

## Local skills

Drop JSON files into your project's `/skills` directory:

```
your-project/
└── skills/
    └── my-custom-deploy.json
```

Each file must be a valid `UnifiedSkillContract`. Local skills with the same `skill_id` as a global skill replace the global entry (logged at `info` level). Invalid local files are skipped and logged as errors — they do not shadow valid global skills.

---

## Missing skills — Skill-Gen scaffold

When `getSkill(id)` returns `undefined`, the registry logs a `warn`-level alert and emits a conservative contract template:

```
[SkillGenScaffold] Skill "my-skill" not found in registry.
Add it to /skills/my-skill.json to enable this capability.
```

The scaffold has conservative defaults (`is_destructive: true`, `requires_hitl: true`, `sandbox_type: "DOCKER"`) — you must consciously opt out, not accidentally leave permissive flags in place. The scaffold does not register itself or auto-execute anything.

---

## MOD-01 integration

MOD-01's `DeterministicGrounder` accepts any `ISkillRegistry`-compatible object. Inject the synced registry at pipeline startup:

```ts
import { createRegistry } from "@franken/skills";
import { createPipeline } from "@franken/firewall";

const registry = createRegistry({ localSkillsDir: "./skills" });
await registry.sync();

const pipeline = createPipeline({ skillRegistry: registry });
```

---

## Architecture decisions

All non-obvious design choices are documented in [`docs/adr/`](docs/adr/):

| ADR | Decision |
|-----|----------|
| [0001](docs/adr/0001-typescript-as-implementation-language.md) | TypeScript strict mode — matches MOD-01 for shared interface types |
| [0002](docs/adr/0002-unified-skill-contract-v1-schema.md) | All contract fields required, no coercion, versioned |
| [0003](docs/adr/0003-cli-subprocess-for-discovery.md) | CLI subprocess over direct npm import — stable contract surface |
| [0004](docs/adr/0004-local-first-precedence.md) | Local skills override global, explicitly logged |
| [0005](docs/adr/0005-in-memory-registry-for-v1.md) | In-memory Map, populated at sync(), replaceable in v2 |
| [0006](docs/adr/0006-iskillregistry-as-public-api-boundary.md) | `ISkillRegistry` exported; concrete class hidden |
| [0007](docs/adr/0007-skill-gen-as-developer-prompt-template.md) | Scaffold is a developer prompt template, never auto-generation |

---

## Development

```bash
npm install
npm test               # run test suite (75 tests)
npm run typecheck      # strict TypeScript check
npm run lint           # ESLint
npm run build          # compile to dist/
npm run test:coverage  # coverage report (>95% line coverage)
```

CI runs `typecheck → lint → test → build` on Node 18, 20, and 22 for every push and PR.

---

## Release

Releases are managed by [release-please](https://github.com/googleapis/release-please). Merge a release PR to publish to npm automatically. Version is driven by [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` → minor bump
- `fix:` / `perf:` → patch bump
- `feat!:` or `BREAKING CHANGE:` → major bump
