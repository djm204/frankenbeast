import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatRepl, sanitizeChatOutput } from '../../../src/cli/chat-repl.js';
import type { ChatIO } from '../../../src/cli/chat-repl.js';

const mockProcessTurn = vi.fn().mockResolvedValue({
  outcome: { kind: 'reply', content: 'Hello!', modelTier: 'cheap' },
  tier: 'cheap',
  newMessages: [
    { role: 'user', content: 'hello', timestamp: new Date().toISOString() },
    { role: 'assistant', content: 'Hello!', timestamp: new Date().toISOString(), modelTier: 'cheap' },
  ],
});

const mockRunTurn = vi.fn().mockResolvedValue({
  status: 'completed',
  summary: 'Done',
  events: [],
});

function mockChatIO() {
  const inputs: string[] = [];
  const outputs: string[] = [];
  const io: ChatIO = {
    prompt: vi.fn(() => Promise.resolve(inputs.shift() ?? '/quit')),
    print: vi.fn((msg: string) => outputs.push(msg)),
    close: vi.fn(),
  };
  return {
    pushInput: (line: string) => inputs.push(line),
    inputs,
    outputs,
    io,
  };
}

describe('ChatRepl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('processes a simple reply turn and displays response', async () => {
    const { io, outputs, pushInput } = mockChatIO();
    pushInput('hello');
    pushInput('/quit');

    const repl = new ChatRepl({
      engine: { processTurn: mockProcessTurn } as any,
      turnRunner: { run: mockRunTurn } as any,
      projectId: 'test',
      io,
    });
    await repl.start();

    expect(mockProcessTurn).toHaveBeenCalledWith('hello', expect.any(Array), { sessionId: 'test' });
    expect(outputs.some(o => o.includes('Hello!'))).toBe(true);
  });

  it('recognizes /quit and exits', async () => {
    const { io } = mockChatIO();
    const repl = new ChatRepl({
      engine: { processTurn: mockProcessTurn } as any,
      turnRunner: { run: mockRunTurn } as any,
      projectId: 'test',
      io,
    });
    await repl.start();
    expect(io.close).toHaveBeenCalled();
  });

  it('does not send slash commands to the engine', async () => {
    const { io, pushInput } = mockChatIO();
    pushInput('/status');
    pushInput('/quit');

    const repl = new ChatRepl({
      engine: { processTurn: mockProcessTurn } as any,
      turnRunner: { run: mockRunTurn } as any,
      projectId: 'test',
      io,
    });
    await repl.start();

    const engineCalls = mockProcessTurn.mock.calls.filter(
      ([input]: [string]) => input === '/status'
    );
    expect(engineCalls).toHaveLength(0);
  });

  it('shows tier in verbose mode', async () => {
    const { io, outputs, pushInput } = mockChatIO();
    pushInput('hello');
    pushInput('/quit');

    const repl = new ChatRepl({
      engine: { processTurn: mockProcessTurn } as any,
      turnRunner: { run: mockRunTurn } as any,
      projectId: 'test',
      verbose: true,
      io,
    });
    await repl.start();

    expect(outputs.some(o => o.includes('cheap'))).toBe(true);
  });

  it('hides tier in non-verbose mode', async () => {
    const { io, outputs, pushInput } = mockChatIO();
    pushInput('hello');
    pushInput('/quit');

    const repl = new ChatRepl({
      engine: { processTurn: mockProcessTurn } as any,
      turnRunner: { run: mockRunTurn } as any,
      projectId: 'test',
      io,
    });
    await repl.start();

    // The response "Hello!" should be there (wrapped in ANSI green), but not the tier label
    expect(outputs.some(o => o.includes('Hello!'))).toBe(true);
    expect(outputs.some(o => o.includes('[cheap]'))).toBe(false);
  });

  it('delegates execute outcomes to TurnRunner', async () => {
    mockProcessTurn.mockResolvedValueOnce({
      outcome: { kind: 'execute', taskDescription: 'Fix bug', approvalRequired: false },
      tier: 'premium_execution',
      newMessages: [{ role: 'user', content: 'fix the bug', timestamp: new Date().toISOString() }],
    });

    const { io, pushInput } = mockChatIO();
    pushInput('fix the bug');
    pushInput('/quit');

    const repl = new ChatRepl({
      engine: { processTurn: mockProcessTurn } as any,
      turnRunner: { run: mockRunTurn } as any,
      projectId: 'test',
      io,
    });
    await repl.start();

    expect(mockRunTurn).toHaveBeenCalled();
  });

  it('displays plan summary for plan outcomes', async () => {
    mockProcessTurn.mockResolvedValueOnce({
      outcome: { kind: 'plan', planSummary: 'Refactor auth module', chunkCount: 3 },
      tier: 'premium_reasoning',
      newMessages: [{ role: 'user', content: 'plan refactor', timestamp: new Date().toISOString() }],
    });

    const { io, outputs, pushInput } = mockChatIO();
    pushInput('plan refactor');
    pushInput('/quit');

    const repl = new ChatRepl({
      engine: { processTurn: mockProcessTurn } as any,
      turnRunner: { run: mockRunTurn } as any,
      projectId: 'test',
      io,
    });
    await repl.start();

    expect(outputs.some(o => o.includes('Refactor auth module'))).toBe(true);
  });

  it('displays clarification question for clarify outcomes', async () => {
    mockProcessTurn.mockResolvedValueOnce({
      outcome: { kind: 'clarify', question: 'Which database?', options: ['postgres', 'sqlite'] },
      tier: 'cheap',
      newMessages: [{ role: 'user', content: 'set up db', timestamp: new Date().toISOString() }],
    });

    const { io, outputs, pushInput } = mockChatIO();
    pushInput('set up db');
    pushInput('/quit');

    const repl = new ChatRepl({
      engine: { processTurn: mockProcessTurn } as any,
      turnRunner: { run: mockRunTurn } as any,
      projectId: 'test',
      io,
    });
    await repl.start();

    expect(outputs.some(o => o.includes('Which database?'))).toBe(true);
  });

  it('surfaces approval prompts for pending_approval status', async () => {
    mockProcessTurn.mockResolvedValueOnce({
      outcome: { kind: 'execute', taskDescription: 'Delete production data', approvalRequired: true },
      tier: 'premium_execution',
      newMessages: [{ role: 'user', content: 'delete data', timestamp: new Date().toISOString() }],
    });

    const mockRunner = {
      run: mockRunTurn.mockResolvedValueOnce({
        status: 'pending_approval',
        summary: 'Approval required',
        events: [],
      }),
    };

    const { io, outputs, pushInput } = mockChatIO();
    pushInput('delete data');
    pushInput('/quit');

    const repl = new ChatRepl({
      engine: { processTurn: mockProcessTurn } as any,
      turnRunner: mockRunner as any,
      projectId: 'test',
      io,
    });
    await repl.start();

    expect(outputs.some(o => o.includes('approval required'))).toBe(true);
  });

  it('handles /session command without crashing', async () => {
    const { io, pushInput } = mockChatIO();
    pushInput('/session');
    pushInput('/quit');

    const repl = new ChatRepl({
      engine: { processTurn: mockProcessTurn } as any,
      turnRunner: { run: mockRunTurn } as any,
      projectId: 'test',
      io,
    });
    await repl.start();
  });

  it('shows spinner while waiting for LLM reply', async () => {
    const slowProcessTurn = vi.fn().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 200));
      return {
        outcome: { kind: 'reply', content: 'Hi there!', modelTier: 'cheap' },
        tier: 'cheap',
        newMessages: [
          { role: 'user', content: 'hey', timestamp: new Date().toISOString() },
          { role: 'assistant', content: 'Hi there!', timestamp: new Date().toISOString(), modelTier: 'cheap' },
        ],
      };
    });

    const { io, outputs, pushInput } = mockChatIO();
    pushInput('hey');
    pushInput('/quit');

    const repl = new ChatRepl({
      engine: { processTurn: slowProcessTurn } as any,
      turnRunner: { run: mockRunTurn } as any,
      projectId: 'test',
      io,
    });
    await repl.start();

    expect(outputs.some(o => o.includes('Hi there!'))).toBe(true);
  });

  it('dispatches /run <description> to TurnRunner as execute outcome', async () => {
    const { io, pushInput } = mockChatIO();
    pushInput('/run create a hello world file');
    pushInput('/quit');

    const repl = new ChatRepl({
      engine: { processTurn: mockProcessTurn } as any,
      turnRunner: { run: mockRunTurn } as any,
      projectId: 'test',
      io,
    });
    await repl.start();

    expect(mockRunTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'execute',
        taskDescription: 'create a hello world file',
      }),
      { sessionId: 'test' },
    );
    // Should NOT go through the engine
    const engineCalls = mockProcessTurn.mock.calls.filter(
      ([input]: [string]) => input.startsWith('/run'),
    );
    expect(engineCalls).toHaveLength(0);
  });

  it('dispatches /plan <description> to TurnRunner as plan outcome', async () => {
    const { io, pushInput } = mockChatIO();
    pushInput('/plan build a react dashboard');
    pushInput('/quit');

    const repl = new ChatRepl({
      engine: { processTurn: mockProcessTurn } as any,
      turnRunner: { run: mockRunTurn } as any,
      projectId: 'test',
      io,
    });
    await repl.start();

    expect(mockRunTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'plan',
        planSummary: 'build a react dashboard',
      }),
      { sessionId: 'test' },
    );
  });

  it('shows error when /run is used without a description', async () => {
    const { io, outputs, pushInput } = mockChatIO();
    pushInput('/run');
    pushInput('/quit');

    const repl = new ChatRepl({
      engine: { processTurn: mockProcessTurn } as any,
      turnRunner: { run: mockRunTurn } as any,
      projectId: 'test',
      io,
    });
    await repl.start();

    expect(outputs.some(o => o.includes('description'))).toBe(true);
    expect(mockRunTurn).not.toHaveBeenCalled();
  });

  it('maintains transcript across turns', async () => {
    const { io, pushInput } = mockChatIO();
    pushInput('first message');
    pushInput('second message');
    pushInput('/quit');

    const repl = new ChatRepl({
      engine: { processTurn: mockProcessTurn } as any,
      turnRunner: { run: mockRunTurn } as any,
      projectId: 'test',
      io,
    });
    await repl.start();

    const secondCall = mockProcessTurn.mock.calls[1];
    expect(secondCall).toBeDefined();
    expect(secondCall[1].length).toBeGreaterThan(0);
  });

  it('surrounds each prompt with a status rule and accumulates real usage across turns', async () => {
    const { io, outputs, pushInput } = mockChatIO();
    pushInput('first');
    pushInput('second');
    pushInput('/quit');

    const usageProcessTurn = vi.fn()
      .mockResolvedValueOnce({
        outcome: { kind: 'reply', content: 'One', modelTier: 'cheap' },
        tier: 'cheap',
        usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
        truncated: true,
        newMessages: [
          { role: 'user', content: 'first', timestamp: new Date().toISOString() },
          { role: 'assistant', content: 'One', timestamp: new Date().toISOString(), modelTier: 'cheap' },
        ],
      })
      .mockResolvedValueOnce({
        outcome: { kind: 'reply', content: 'Two', modelTier: 'cheap' },
        tier: 'cheap',
        usage: { inputTokens: 50, outputTokens: 10, totalTokens: 60 },
        newMessages: [
          { role: 'user', content: 'second', timestamp: new Date().toISOString() },
          { role: 'assistant', content: 'Two', timestamp: new Date().toISOString(), modelTier: 'cheap' },
        ],
      });

    const repl = new ChatRepl({
      engine: { processTurn: usageProcessTurn } as any,
      turnRunner: { run: mockRunTurn } as any,
      projectId: 'test',
      io,
      contextMaxTokens: 1000,
      modelLabel: 'test-model',
    });
    await repl.start();

    // A status rule is printed before every prompt and again right after
    // the input is read, so the exchange is visually boxed top and bottom.
    const ruleOutputs = outputs.filter((o) => o.includes('test-model'));
    expect(ruleOutputs.length).toBeGreaterThanOrEqual(6); // 3 prompts (incl. /quit) × 2 rules each

    // First turn's usage (120 tokens) is visible on the rule printed for the
    // second prompt; by the third (final) prompt both turns are summed.
    expect(ruleOutputs.some((o) => /120\/1000|12%/.test(o))).toBe(true);
    const finalRule = ruleOutputs[ruleOutputs.length - 1]!;
    expect(finalRule).toContain('18%'); // (120+60)/1000
    expect(finalRule).toContain('compactions 1');
  });

  it('reflects the real serving provider on the status rule after a fallback, and feeds it to the next turn', async () => {
    const { io, outputs, pushInput } = mockChatIO();
    pushInput('first');
    pushInput('second');
    pushInput('/quit');

    const fallbackProcessTurn = vi.fn()
      .mockResolvedValueOnce({
        outcome: { kind: 'reply', content: 'Running on claude now.', modelTier: 'cheap' },
        tier: 'cheap',
        providerContext: { provider: 'claude', model: 'claude-sonnet-4-6', switchedFrom: 'codex', switchReason: 'rate_limited' },
        newMessages: [
          { role: 'user', content: 'first', timestamp: new Date().toISOString() },
          { role: 'assistant', content: 'Running on claude now.', timestamp: new Date().toISOString(), modelTier: 'cheap' },
        ],
      })
      .mockResolvedValueOnce({
        outcome: { kind: 'reply', content: 'Still on claude.', modelTier: 'cheap' },
        tier: 'cheap',
        newMessages: [
          { role: 'user', content: 'second', timestamp: new Date().toISOString() },
          { role: 'assistant', content: 'Still on claude.', timestamp: new Date().toISOString(), modelTier: 'cheap' },
        ],
      });

    const repl = new ChatRepl({
      engine: { processTurn: fallbackProcessTurn } as any,
      turnRunner: { run: mockRunTurn } as any,
      projectId: 'test',
      io,
      modelLabel: 'codex',
    });
    await repl.start();

    const statusRules = outputs.filter((o) => o.includes('session'));

    // Before any turn completes, the static configured label is shown.
    expect(statusRules[0]).toContain('codex');
    expect(statusRules[0]).not.toContain('claude');

    // Once the fallback is known, the model-specific label replaces it.
    const claudeRules = statusRules.filter((o) => o.includes('claude-sonnet-4-6'));
    expect(claudeRules.length).toBeGreaterThan(0);
    expect(claudeRules.every((o) => !/codex/.test(o))).toBe(true);

    // The second turn is told about the fallback that happened on the first.
    expect(fallbackProcessTurn).toHaveBeenNthCalledWith(
      2,
      'second',
      expect.any(Array),
      expect.objectContaining({
        priorProviderContext: { provider: 'claude', model: 'claude-sonnet-4-6', switchedFrom: 'codex', switchReason: 'rate_limited' },
      }),
    );
  });
});

describe('sanitizeChatOutput', () => {
  it('strips web search results JSON blob and keeps the answer', () => {
    const raw = [
      'Web search results for query: "weather Niverville Manitoba"',
      '',
      'Links: [{"title":"Environment Canada","url":"https://weather.gc.ca"}]',
      '',
      'The weather is -9°C and sunny.',
    ].join('\n');
    expect(sanitizeChatOutput(raw)).toBe('The weather is -9°C and sunny.');
  });

  it('strips REMINDER instruction blocks', () => {
    const raw = [
      'The answer is 42.',
      '',
      '',
      'REMINDER: You MUST include the sources above in your response.',
    ].join('\n');
    expect(sanitizeChatOutput(raw)).toBe('The answer is 42.');
  });

  it('strips both web search blob and REMINDER together', () => {
    const raw = [
      'Web search results for query: "test query"',
      '',
      'Links: [{"title":"Test","url":"https://example.com"}]',
      '',
      'Here is the answer.',
      '',
      '',
      'REMINDER: You MUST include the sources.',
    ].join('\n');
    expect(sanitizeChatOutput(raw)).toBe('Here is the answer.');
  });

  it('passes through clean text unchanged', () => {
    expect(sanitizeChatOutput('Hello, how are you?')).toBe('Hello, how are you?');
  });

  it('handles multi-link JSON blobs', () => {
    const raw = [
      'Web search results for query: "big search"',
      '',
      'Links: [{"title":"A","url":"https://a.com"},{"title":"B","url":"https://b.com"},{"title":"C","url":"https://c.com"}]',
      '',
      'The result is here.',
    ].join('\n');
    expect(sanitizeChatOutput(raw)).toBe('The result is here.');
  });
});
