# Chunk C: CLI Commands

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `skill`, `provider`, `security`, and `dashboard` command groups to the frankenbeast CLI.

**Architecture:** The CLI uses `node:util parseArgs` in `args.ts` with a `Subcommand` union type and per-subcommand handler functions. New commands follow the same pattern as `beasts` (action + target). Each command delegates to existing APIs (SkillManager, ProviderRegistry, SecurityConfig) — no new business logic, just CLI plumbing.

**Tech Stack:** TypeScript, Vitest, node:util parseArgs

**Resolves:** Phase 8 M3
**Sequence after:** Chunk A (both modify `run.ts` — file-level conflict risk)

---

## File Map

### Create
- `packages/franken-orchestrator/src/cli/skill-cli.ts` — `handleSkillCommand()` handler
- `packages/franken-orchestrator/src/cli/provider-cli.ts` — `handleProviderCommand()` handler
- `packages/franken-orchestrator/src/cli/security-cli.ts` — `handleSecurityCommand()` handler
- `packages/franken-orchestrator/src/cli/dashboard-cli.ts` — `handleDashboardCommand()` handler
- `packages/franken-orchestrator/tests/unit/cli/skill-cli.test.ts`
- `packages/franken-orchestrator/tests/unit/cli/provider-cli.test.ts`
- `packages/franken-orchestrator/tests/unit/cli/security-cli.test.ts`
- `packages/franken-orchestrator/tests/unit/cli/dashboard-cli.test.ts`

### Modify
- `packages/franken-orchestrator/src/cli/args.ts` — Add `skill`, `provider`, `security`, `dashboard` to `Subcommand` union + action types + `parseArgs` options
- `packages/franken-orchestrator/src/cli/run.ts` — Route new subcommands to handlers

---

## Commands

### `frankenbeast skill <action> [target]`
| Action | Description | Delegates to |
|--------|-------------|-------------|
| `list` | List installed skills with enabled state | `SkillManager.list()` |
| `add <name>` | Install a skill from directory or catalog | `SkillManager.install()` |
| `remove <name>` | Uninstall a skill | `SkillManager.uninstall()` |
| `enable <name>` | Enable a skill | `SkillManager.enable()` |
| `disable <name>` | Disable a skill | `SkillManager.disable()` |
| `info <name>` | Show skill details (mcp.json, context, health) | `SkillManager.get()` + `SkillHealthChecker` |

### `frankenbeast provider <action> [target]`
| Action | Description | Delegates to |
|--------|-------------|-------------|
| `list` | List configured providers | `ProviderRegistry.getProviders()` |
| `add <type>` | Add a provider interactively | Config file write |
| `remove <name>` | Remove a provider | Config file write |
| `test [name]` | Test provider availability | `provider.isAvailable()` |

### `frankenbeast security <action>`
| Action | Description | Delegates to |
|--------|-------------|-------------|
| `status` | Show active security profile + middleware state | `resolveSecurityConfig()` |
| `set <profile>` | Set security profile (strict/standard/permissive) | Config file write |

### `frankenbeast dashboard`
| Action | Description | Delegates to |
|--------|-------------|-------------|
| (default) | Start the dashboard server | `startChatServer()` with dashboard flag |

---

## Tasks

### Task 1: Extend args.ts with new subcommands

**Files:**
- Modify: `src/cli/args.ts`
- Test: existing args tests

- [ ] **Step 1:** Write failing test — `parseArgs(['skill', 'list'])` returns `{ subcommand: 'skill', skillAction: 'list' }`
- [ ] **Step 2:** Add `'skill' | 'provider' | 'security' | 'dashboard'` to `Subcommand` union
- [ ] **Step 3:** Add `SkillAction`, `ProviderAction`, `SecurityAction` types
- [ ] **Step 4:** Add corresponding fields to `CliArgs`
- [ ] **Step 5:** Update `parseArgs()` to handle new subcommands
- [ ] **Step 6:** Run tests, commit

### Task 2: Skill CLI handler

**Files:**
- Create: `src/cli/skill-cli.ts`
- Test: `tests/unit/cli/skill-cli.test.ts`

- [ ] **Step 1:** Write failing test — `handleSkillCommand` with action `list` calls `SkillManager.list()` and prints results
- [ ] **Step 2:** Implement `handleSkillCommand()` with `list` action
- [ ] **Step 3:** Write test for `add` action
- [ ] **Step 4:** Implement `add`
- [ ] **Step 5:** Write test for `remove` action
- [ ] **Step 6:** Implement `remove`
- [ ] **Step 7:** Write tests for `enable`, `disable`, `info`
- [ ] **Step 8:** Implement remaining actions
- [ ] **Step 9:** Run tests, commit

### Task 3: Provider CLI handler

**Files:**
- Create: `src/cli/provider-cli.ts`
- Test: `tests/unit/cli/provider-cli.test.ts`

- [ ] **Step 1:** Write failing test — `handleProviderCommand` with `list` prints providers
- [ ] **Step 2:** Implement `handleProviderCommand()` — list, add, remove, test
- [ ] **Step 3:** Run tests, commit

### Task 4: Security CLI handler

**Files:**
- Create: `src/cli/security-cli.ts`
- Test: `tests/unit/cli/security-cli.test.ts`

- [ ] **Step 1:** Write failing test — `handleSecurityCommand` with `status` prints profile
- [ ] **Step 2:** Implement `handleSecurityCommand()` — status, set
- [ ] **Step 3:** Run tests, commit

### Task 5: Dashboard CLI handler

**Files:**
- Create: `src/cli/dashboard-cli.ts`
- Test: `tests/unit/cli/dashboard-cli.test.ts`

- [ ] **Step 1:** Write failing test — `handleDashboardCommand` starts server
- [ ] **Step 2:** Implement — delegates to `startChatServer()` with dashboard options
- [ ] **Step 3:** Run tests, commit

### Task 6: Route in run.ts

**Files:**
- Modify: `src/cli/run.ts`

- [ ] **Step 1:** Import new handlers
- [ ] **Step 2:** Add `case 'skill':`, `case 'provider':`, `case 'security':`, `case 'dashboard':` routing
- [ ] **Step 3:** Run full test suite, commit

### Task 7: Update help text and usage

- [ ] **Step 1:** Update `printUsage()` in args.ts with new commands
- [ ] **Step 2:** Commit
