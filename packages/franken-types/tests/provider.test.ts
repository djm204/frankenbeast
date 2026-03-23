import { describe, it, expect } from 'vitest';
import {
  TokenUsageSchema,
  McpServerConfigSchema,
  SkillCatalogEntrySchema,
  ToolDefinitionSchema,
  type ILlmProvider,
  type ProviderCapabilities,
  type ProviderType,
  type ProviderAuthMethod,
  type LlmRequest,
  type LlmMessage,
  type LlmContentBlock,
  type LlmStreamEvent,
  type TokenUsage,
  type SkillCatalogEntry,
  type McpServerConfig,
  type AuthField,
  type ToolDefinition,
  type ImageSource,
  type CritiqueContext,
  type CritiqueResult,
  type ProviderSkillConfig,
} from '../src/index.js';

describe('TokenUsageSchema', () => {
  it('validates well-formed usage', () => {
    const usage: TokenUsage = { inputTokens: 100, outputTokens: 50, totalTokens: 150 };
    expect(TokenUsageSchema.parse(usage)).toEqual(usage);
  });

  it('rejects negative inputTokens', () => {
    expect(() =>
      TokenUsageSchema.parse({ inputTokens: -1, outputTokens: 0, totalTokens: 0 }),
    ).toThrow();
  });

  it('rejects negative outputTokens', () => {
    expect(() =>
      TokenUsageSchema.parse({ inputTokens: 0, outputTokens: -5, totalTokens: 0 }),
    ).toThrow();
  });

  it('rejects negative totalTokens', () => {
    expect(() =>
      TokenUsageSchema.parse({ inputTokens: 0, outputTokens: 0, totalTokens: -1 }),
    ).toThrow();
  });
});

describe('ToolDefinitionSchema', () => {
  it('validates a normalized tool schema', () => {
    const tool: ToolDefinition = {
      name: 'read_file',
      description: 'Read a file from disk',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    };
    expect(ToolDefinitionSchema.parse(tool)).toEqual(tool);
  });

  it('rejects empty name', () => {
    expect(() =>
      ToolDefinitionSchema.parse({
        name: '',
        description: 'A tool',
        inputSchema: {},
      }),
    ).toThrow();
  });

  it('accepts empty inputSchema', () => {
    const tool = { name: 'noop', description: 'Does nothing', inputSchema: {} };
    expect(ToolDefinitionSchema.parse(tool)).toEqual(tool);
  });
});

describe('McpServerConfigSchema', () => {
  it('validates stdio config', () => {
    const config: McpServerConfig = {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem'],
      env: { HOME: '/home/user' },
    };
    expect(McpServerConfigSchema.parse(config)).toEqual(config);
  });

  it('validates HTTP config', () => {
    const config: McpServerConfig = {
      command: 'node',
      url: 'http://localhost:3000/mcp',
    };
    expect(McpServerConfigSchema.parse(config)).toEqual(config);
  });

  it('rejects empty command', () => {
    expect(() => McpServerConfigSchema.parse({ command: '' })).toThrow();
  });

  it('rejects invalid url', () => {
    expect(() =>
      McpServerConfigSchema.parse({ command: 'node', url: 'not-a-url' }),
    ).toThrow();
  });
});

describe('SkillCatalogEntrySchema', () => {
  const validEntry: SkillCatalogEntry = {
    name: 'github',
    description: 'GitHub integration',
    provider: 'claude-cli',
    installConfig: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
    },
    authFields: [
      { key: 'GITHUB_TOKEN', label: 'GitHub Token', type: 'secret', required: true },
    ],
  };

  it('validates catalog entry', () => {
    expect(SkillCatalogEntrySchema.parse(validEntry)).toEqual(validEntry);
  });

  it('validates optional toolDefinitions', () => {
    const withTools: SkillCatalogEntry = {
      ...validEntry,
      toolDefinitions: [
        { name: 'create_issue', description: 'Create a GitHub issue', inputSchema: {} },
      ],
    };
    expect(SkillCatalogEntrySchema.parse(withTools)).toEqual(withTools);
  });

  it('rejects empty name', () => {
    expect(() =>
      SkillCatalogEntrySchema.parse({ ...validEntry, name: '' }),
    ).toThrow();
  });

  it('rejects empty provider', () => {
    expect(() =>
      SkillCatalogEntrySchema.parse({ ...validEntry, provider: '' }),
    ).toThrow();
  });
});

describe('Provider interfaces (type-level)', () => {
  it('ProviderType covers all 6 adapter types', () => {
    const types: ProviderType[] = [
      'claude-cli',
      'codex-cli',
      'gemini-cli',
      'anthropic-api',
      'openai-api',
      'gemini-api',
    ];
    expect(types).toHaveLength(6);
  });

  it('ProviderAuthMethod covers all methods', () => {
    const methods: ProviderAuthMethod[] = ['cli-login', 'api-key', 'none'];
    expect(methods).toHaveLength(3);
  });

  it('LlmStreamEvent discriminated union covers all event types', () => {
    const events: LlmStreamEvent[] = [
      { type: 'text', content: 'Hello' },
      { type: 'tool_use', id: 'tu-1', name: 'read_file', input: { path: 'a.ts' } },
      { type: 'tool_result', toolUseId: 'tu-1', content: 'file contents' },
      { type: 'done', usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } },
      { type: 'error', error: 'rate limit', retryable: true },
    ];
    expect(events).toHaveLength(5);
  });

  it('LlmContentBlock union covers text, image, and tool_result', () => {
    const blocks: LlmContentBlock[] = [
      { type: 'text', text: 'Hello' },
      { type: 'image', source: { type: 'base64', mediaType: 'image/png', data: 'abc' } as ImageSource },
      { type: 'tool_result', toolUseId: 'tu-1', content: 'result' },
    ];
    expect(blocks).toHaveLength(3);
  });

  it('ILlmProvider has required shape', () => {
    const provider: ILlmProvider = {
      name: 'test',
      type: 'claude-cli',
      authMethod: 'cli-login',
      capabilities: {
        streaming: true,
        toolUse: true,
        vision: true,
        maxContextTokens: 200000,
        mcpSupport: true,
        skillDiscovery: true,
      } satisfies ProviderCapabilities,
      execute: (_req: LlmRequest) => (async function* () {})(),
      isAvailable: async () => true,
      formatHandoff: () => '',
    };
    expect(provider).toBeDefined();
    expect(provider.capabilities.maxContextTokens).toBe(200000);
  });

  it('ILlmProvider supports optional discoverSkills', () => {
    const provider: ILlmProvider = {
      name: 'test',
      type: 'anthropic-api',
      authMethod: 'api-key',
      capabilities: {
        streaming: true,
        toolUse: true,
        vision: false,
        maxContextTokens: 100000,
        mcpSupport: false,
        skillDiscovery: true,
      },
      execute: (_req: LlmRequest) => (async function* () {})(),
      isAvailable: async () => true,
      formatHandoff: () => '',
      discoverSkills: async () => [],
    };
    expect(provider.discoverSkills).toBeDefined();
  });

  it('CritiqueContext and CritiqueResult have required shape', () => {
    const ctx: CritiqueContext = {
      phase: 'execution',
      stepsCompleted: 3,
      workSummary: 'Implemented auth',
      objective: 'Add user login',
    };
    const result: CritiqueResult = {
      evaluator: 'reflection',
      severity: 7,
      message: 'Missing error handling',
      suggestion: 'Add try/catch around API calls',
    };
    expect(ctx.phase).toBe('execution');
    expect(result.severity).toBe(7);
  });

  it('ProviderSkillConfig has required shape', () => {
    const config: ProviderSkillConfig = {
      tools: [{ name: 'tool1', description: 'A tool', inputSchema: {} }],
      systemPromptAddition: 'Use these tools wisely',
      mcpConfigPath: '/tmp/mcp.json',
      cliArgs: ['--model', 'opus'],
      filesToWrite: [{ path: '/tmp/context.md', content: '# Context' }],
    };
    expect(config.systemPromptAddition).toBeTruthy();
  });

  it('LlmRequest has required shape', () => {
    const request: LlmRequest = {
      systemPrompt: 'You are helpful',
      messages: [
        { role: 'user', content: 'Hello' } satisfies LlmMessage,
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hi there' }],
        } satisfies LlmMessage,
      ],
      tools: [{ name: 'read', description: 'Read file', inputSchema: {} }],
      maxTokens: 4096,
      temperature: 0.7,
    };
    expect(request.messages).toHaveLength(2);
  });

  it('AuthField has required shape', () => {
    const field: AuthField = {
      key: 'API_KEY',
      label: 'API Key',
      type: 'secret',
      required: true,
    };
    expect(field.type).toBe('secret');
  });
});
