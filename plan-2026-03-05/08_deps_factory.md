# Chunk 08: Deps Factory

## Objective

Create a factory function that constructs real `BeastLoopDeps` from CLI args. This bridges the CLI entry point to the orchestrator by instantiating concrete adapters, wrapping them in port adapters, and wiring the logger.

## Files

- Create: `franken-orchestrator/src/cli/deps-factory.ts`
- Create: `franken-orchestrator/tests/unit/cli/deps-factory.test.ts`

## Context

CLI args from `franken-orchestrator/src/cli/args.ts`:
```typescript
interface CliArgs {
  projectId: string;
  provider?: string;   // 'anthropic' | 'openai' | 'local-ollama'
  model?: string;
  dryRun: boolean;
  verbose: boolean;
  resume?: string;
  help: boolean;
}
```

Firewall adapter constructors (from `frankenfirewall/src/adapters/`):
```typescript
// frankenfirewall/src/adapters/claude/claude-adapter.ts
ClaudeAdapter({ apiKey: string, model: string, apiBaseUrl?: string })

// frankenfirewall/src/adapters/openai/openai-adapter.ts
OpenAIAdapter({ apiKey: string, model: string, apiBaseUrl?: string })

// frankenfirewall/src/adapters/ollama/ollama-adapter.ts
OllamaAdapter({ model: string, baseUrl?: string })
```

Port adapters from chunk 05 (`franken-orchestrator/src/adapters/`):
```typescript
FirewallPortAdapter(adapter: IAdapter)
SkillsPortAdapter(registry: SkillRegistry, llmClient: ILlmClient, mcp?: IMcpModule)
MemoryPortAdapter(context?: Partial<MemoryContext>)
PlannerPortAdapter(llmClient: ILlmClient)
ObserverPortAdapter()
CritiquePortAdapter(llmClient: ILlmClient)
GovernorPortAdapter(defaultDecision?: 'approved' | 'rejected')
HeartbeatPortAdapter()
```

`AdapterLlmClient` from chunk 06 (`franken-orchestrator/src/adapters/adapter-llm-client.ts`):
```typescript
class AdapterLlmClient implements ILlmClient {
  constructor(adapter: IAdapter)
  complete(prompt: string): Promise<string>
}
```

`ConsoleLogger` and `NullLogger` from chunk 07 (`franken-orchestrator/src/logger.ts`):
```typescript
class ConsoleLogger implements ILogger { constructor({ verbose: boolean }) }
class NullLogger implements ILogger { }
```

## Success Criteria

- [ ] `createDeps(args: CliArgs): BeastLoopDeps` factory function exported
- [ ] Provider resolution: `'anthropic'` → `ClaudeAdapter`, `'openai'` → `OpenAIAdapter`, `'local-ollama'` → `OllamaAdapter`
- [ ] API key read from env: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` (Ollama needs no key)
- [ ] Default models: `anthropic → 'claude-sonnet-4-6'`, `openai → 'gpt-4o'`, `local-ollama → 'llama3.2'`
- [ ] `args.model` overrides defaults when provided
- [ ] Error thrown for missing API key (non-Ollama providers)
- [ ] Error thrown for unknown provider
- [ ] `AdapterLlmClient` wraps the firewall adapter to create the shared `ILlmClient`
- [ ] Same `ILlmClient` instance shared across all adapters that need LLM access (skills, planner, critique)
- [ ] `ConsoleLogger` created with `verbose: args.verbose` and included in deps
- [ ] All port adapters wired into `BeastLoopDeps` object
- [ ] `mcp` field left as `undefined` (MCP wiring is future work)
- [ ] Unit tests: valid provider → returns deps, missing key → throws, unknown provider → throws, default provider is anthropic
- [ ] TypeScript compiles

## Verification Command

```bash
cd franken-orchestrator && npx vitest run tests/unit/cli/deps-factory.test.ts && npx tsc --noEmit
```

## Hardening Requirements

- The factory MUST import concrete firewall adapters (`ClaudeAdapter`, `OpenAIAdapter`, `OllamaAdapter`) from `frankenfirewall` — this is the ONE place where concrete external dependencies are wired
- Also import `SkillRegistry` from `franken-skills` for `SkillsPortAdapter`
- API key env vars: `process.env.ANTHROPIC_API_KEY`, `process.env.OPENAI_API_KEY`
- If `args.provider` is undefined, default to `'anthropic'`
- The `clock` field in deps should be `() => new Date()`
- Governor should auto-approve for CLI usage (no interactive HITL in v1): `GovernorPortAdapter('approved')`
- Memory uses in-memory context for now: `MemoryPortAdapter()`
- Unit tests should mock env vars using `vi.stubEnv()` or direct `process.env` assignment in `beforeEach`/`afterEach`
- Export a `resolveProvider(args: CliArgs): string` helper for testability
- Logger must be wired: `logger: new ConsoleLogger({ verbose: args.verbose })`
