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
  inputSchema: Record<string, unknown>;
}

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
  toolDefinitions?: ToolDefinition[];
}

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
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
  severity: number;
  message: string;
  suggestion?: string;
}

// --- Skill Loading Types (used by Phase 5 SkillManager + Phase 8 Beast Loop) ---

export interface ProviderSkillConfig {
  tools?: ToolDefinition[];
  systemPromptAddition: string;
  mcpConfigPath?: string;
  cliArgs?: string[];
  filesToWrite?: Array<{ path: string; content: string }>;
}

// --- Zod Schemas ---

export const ToolDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  inputSchema: z.record(z.unknown()),
});

export const TokenUsageSchema = z.object({
  inputTokens: z.number().nonnegative(),
  outputTokens: z.number().nonnegative(),
  totalTokens: z.number().nonnegative(),
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
  authFields: z.array(
    z.object({
      key: z.string().min(1),
      label: z.string(),
      type: z.enum(['secret', 'text']),
      required: z.boolean(),
    }),
  ),
  toolDefinitions: z.array(ToolDefinitionSchema).optional(),
});
