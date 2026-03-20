# Chunk 3.1: Provider Interfaces + Types

**Phase:** 3 — Provider Registry + Adapters
**Depends on:** Phase 2, Chunk 2.1 (BrainSnapshot type)
**Estimated size:** Small (~120 lines of types)

---

## Purpose

Define `ILlmProvider`, `ProviderCapabilities`, `LlmRequest`, `LlmStreamEvent`, and `SkillCatalogEntry` in `franken-types`. These are the contracts that all 6 provider adapters implement and the `ProviderRegistry` consumes.

## Types

Add to `packages/franken-types/src/provider.ts`:

```typescript
import { z } from 'zod';
import type { BrainSnapshot } from './brain.js';

// --- Provider Interface ---

export interface ILlmProvider {
  /** User-visible/configured provider name, e.g. 'claude', 'openai-primary' */
  readonly name: string;

  /** Concrete implementation type, e.g. 'claude-cli', 'anthropic-api' */
  readonly type: ProviderType;

  /** How this provider authenticates */
  readonly authMethod: ProviderAuthMethod;

  /** What this provider supports */
  readonly capabilities: ProviderCapabilities;

  /** Execute an LLM request, yielding streaming events */
  execute(request: LlmRequest): AsyncIterable<LlmStreamEvent>;

  /** Check if the provider is configured and authenticated */
  isAvailable(): Promise<boolean>;

  /**
   * Format a brain snapshot for handoff to this provider.
   * Each provider receives context differently:
   * - Claude CLI: --append-system-prompt
   * - Codex CLI: config override or stdin
   * - Gemini CLI: GEMINI.md file
   * - API adapters: system message
   */
  formatHandoff(snapshot: BrainSnapshot): string;

  /** Optional: discover available marketplace skills */
  discoverSkills?(): Promise<SkillCatalogEntry[]>;
}

// --- Capabilities ---

export interface ProviderCapabilities {
  streaming: boolean;
  toolUse: boolean;
  vision: boolean;
  maxContextTokens: number;
  mcpSupport: boolean;
  skillDiscovery: boolean;
}

export type ProviderType =
  | 'claude-cli'
  | 'codex-cli'
  | 'gemini-cli'
  | 'anthropic-api'
  | 'openai-api'
  | 'gemini-api';

export type ProviderAuthMethod = 'cli-login' | 'api-key' | 'none';

// --- Request/Response Types ---

export interface LlmRequest {
  systemPrompt: string;
  messages: LlmMessage[];
  tools?: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
}

export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string | LlmContentBlock[];
}

export type LlmContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: ImageSource }
  | { type: 'tool_result'; toolUseId: string; content: string };

export interface ImageSource {
  type: 'base64';
  mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
  data: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;  // JSON Schema
}

export const ToolDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  inputSchema: z.record(z.unknown()),
});

// --- Stream Events ---

export type LlmStreamEvent =
  | { type: 'text'; content: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; toolUseId: string; content: string; isError?: boolean }
  | { type: 'done'; usage: TokenUsage }
  | { type: 'error'; error: string; retryable: boolean };

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

// --- Skill Discovery ---

export interface SkillCatalogEntry {
  name: string;
  description: string;
  provider: string;
  installConfig: McpServerConfig;
  authFields: AuthField[];
  toolDefinitions?: ToolDefinition[];   // normalized tool schemas for API adapters
}

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;  // for HTTP-based MCP servers
}

export interface AuthField {
  key: string;
  label: string;
  type: 'secret' | 'text';
  required: boolean;
}

// --- Critique Types (used by Phase 6 ReflectionEvaluator + Phase 8 Beast Loop) ---

export interface CritiqueContext {
  phase?: string;
  stepsCompleted?: number;
  workSummary?: string;
  objective?: string;
}

export interface CritiqueResult {
  evaluator: string;
  severity: number;             // 1-10
  message: string;
  suggestion?: string;
}

// --- Skill Loading Types (used by Phase 5 SkillManager + Phase 8 Beast Loop) ---

export interface ProviderSkillConfig {
  tools?: ToolDefinition[];
  systemPromptAddition: string;  // combined context.md content
  mcpConfigPath?: string;        // path to merged MCP config file (for CLI providers)
  cliArgs?: string[];            // optional provider-specific launch args
  filesToWrite?: Array<{ path: string; content: string }>; // temp files prepared before spawn
}

// --- Zod Schemas ---

export const TokenUsageSchema = z.object({
  inputTokens: z.number().nonneg(),
  outputTokens: z.number().nonneg(),
  totalTokens: z.number().nonneg(),
});

export const McpServerConfigSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  url: z.string().url().optional(),
});

export const SkillCatalogEntrySchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  provider: z.string().min(1),
  installConfig: McpServerConfigSchema,
  authFields: z.array(z.object({
    key: z.string().min(1),
    label: z.string(),
    type: z.enum(['secret', 'text']),
    required: z.boolean(),
  })),
  toolDefinitions: z.array(ToolDefinitionSchema).optional(),
});
```

## What to Do

### 1. Create `packages/franken-types/src/provider.ts`

### 2. Export from package index

```typescript
// packages/franken-types/src/index.ts
export * from './provider.js';
```

### 3. Write tests

```typescript
// packages/franken-types/tests/provider.test.ts
describe('Provider types', () => {
  it('McpServerConfigSchema validates stdio config', () => { ... });
  it('McpServerConfigSchema validates HTTP config', () => { ... });
  it('SkillCatalogEntrySchema validates catalog entry', () => { ... });
  it('SkillCatalogEntrySchema validates optional toolDefinitions', () => { ... });
  it('ToolDefinitionSchema validates normalized tool schemas', () => { ... });
  it('TokenUsageSchema validates usage', () => { ... });
  it('rejects negative token counts', () => { ... });
});
```

## Files

- **Add:** `packages/franken-types/src/provider.ts`
- **Modify:** `packages/franken-types/src/index.ts` — add re-export
- **Add:** `packages/franken-types/tests/provider.test.ts`

## Exit Criteria

- All provider interfaces and types exported from `@frankenbeast/types`
- Zod schemas validate correctly
- `npm run build && npm run typecheck` for `franken-types` succeeds
