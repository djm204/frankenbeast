import { describe, it, expect, vi } from 'vitest';
import { ConversationEngine, formatProviderTransparencyNote } from '../../../src/chat/conversation-engine.js';
import { ModelTier } from '../../../src/chat/types.js';
import type { ILlmClient, ProviderContext } from '@franken/types';

function mockLlm(response = 'Mock response'): ILlmClient {
  return { complete: vi.fn().mockResolvedValue(response) };
}

describe('ConversationEngine', () => {
  it('processes a simple chat turn end-to-end', async () => {
    const llm = mockLlm('Hello back!');
    const engine = new ConversationEngine({ llm, projectName: 'test' });
    const result = await engine.processTurn('hello', []);

    expect(result.outcome.kind).toBe('reply');
    if (result.outcome.kind === 'reply') {
      expect(result.outcome.content).toBe('Hello back!');
    }
    expect(result.tier).toBe(ModelTier.Cheap);
  });

  it('calls the LLM for reply outcomes', async () => {
    const llm = mockLlm('response');
    const engine = new ConversationEngine({ llm, projectName: 'test' });
    await engine.processTurn('how are you?', []);
    expect(llm.complete).toHaveBeenCalled();
  });

  it('sends the Frankenbeast persona prompt to the llm for reply turns', async () => {
    const llm: ILlmClient = { complete: vi.fn().mockResolvedValue('I am Frankenbeast.') };
    const engine = new ConversationEngine({ llm, projectName: 'test' });

    await engine.processTurn('who are you?', []);

    expect(llm.complete).toHaveBeenCalledWith(
      expect.stringContaining('You are Frankenbeast'),
      expect.objectContaining({ sessionContinue: false }),
    );
    expect(llm.complete).toHaveBeenCalledWith(
      expect.stringContaining('Do not describe yourself as Claude, Codex, or any underlying model or provider'),
      expect.objectContaining({ sessionContinue: false }),
    );
  });

  it('does not pass chat session ids to the provider when continuation is disabled', async () => {
    const llm = mockLlm('response');
    const engine = new ConversationEngine({ llm, projectName: 'test', sessionContinuation: false });

    await engine.processTurn('hello', [], { sessionId: 'session-1' });

    expect(llm.complete).toHaveBeenCalledWith(
      expect.stringContaining('You are Frankenbeast'),
      { sessionContinue: false },
    );
  });

  it('does NOT call the LLM for execute outcomes', async () => {
    const llm = mockLlm();
    const engine = new ConversationEngine({ llm, projectName: 'test' });
    const result = await engine.processTurn('fix the login bug in auth.ts', []);
    expect(result.outcome.kind).toBe('execute');
    expect(llm.complete).not.toHaveBeenCalled();
  });

  it('records transcript messages for reply turns', async () => {
    const llm = mockLlm('Hi!');
    const engine = new ConversationEngine({ llm, projectName: 'test' });
    const result = await engine.processTurn('hello', []);

    expect(result.newMessages).toHaveLength(2); // user + assistant
    expect(result.newMessages[0]!.role).toBe('user');
    expect(result.newMessages[1]!.role).toBe('assistant');
    expect(result.newMessages[1]!.modelTier).toBe(ModelTier.Cheap);
  });

  it('catches LLM errors and returns error reply', async () => {
    const llm: ILlmClient = { complete: vi.fn().mockRejectedValue(new Error('API timeout')) };
    const engine = new ConversationEngine({ llm, projectName: 'test' });
    const result = await engine.processTurn('hello', []);

    expect(result.outcome.kind).toBe('reply');
    if (result.outcome.kind === 'reply') {
      expect(result.outcome.content.toLowerCase()).toContain('error');
    }
  });

  it('surfaces real provider context from completeWithUsage on the turn result', async () => {
    const providerContext: ProviderContext = { provider: 'claude', model: 'claude-sonnet-4-6' };
    const llm = {
      complete: vi.fn().mockResolvedValue('should not be used'),
      completeWithUsage: vi.fn().mockResolvedValue({ text: 'Hello!', providerContext }),
    };
    const engine = new ConversationEngine({ llm, projectName: 'test' });

    const result = await engine.processTurn('hello', []);

    expect(result.providerContext).toEqual(providerContext);
  });

  it('does not inject a transparency note on the very first turn (nothing known yet)', async () => {
    const llm = mockLlm('Hello!');
    const engine = new ConversationEngine({ llm, projectName: 'test' });

    await engine.processTurn('hello', []);

    expect(llm.complete).toHaveBeenCalledWith(
      expect.not.stringContaining('Runtime status'),
      expect.anything(),
    );
  });

  it('injects a plain runtime-status note when the prior turn used the configured provider', async () => {
    const llm = mockLlm('Hello!');
    const engine = new ConversationEngine({ llm, projectName: 'test' });

    await engine.processTurn('hello', [], {
      priorProviderContext: { provider: 'codex', model: 'codex-mini' },
    });

    expect(llm.complete).toHaveBeenCalledWith(
      expect.stringContaining('Runtime status from the most recently completed turn: it was served by the "codex" CLI provider.'),
      expect.anything(),
    );
    expect(llm.complete).toHaveBeenCalledWith(
      expect.stringContaining('The specific underlying model is "codex-mini".'),
      expect.anything(),
    );
    expect(llm.complete).toHaveBeenCalledWith(
      expect.not.stringContaining('fallback'),
      expect.anything(),
    );
  });

  it('tells the model not to guess a version when none is known', async () => {
    const llm = mockLlm('Hello!');
    const engine = new ConversationEngine({ llm, projectName: 'test' });

    await engine.processTurn('hello', [], {
      priorProviderContext: { provider: 'codex' },
    });

    expect(llm.complete).toHaveBeenCalledWith(
      expect.stringContaining('not exposed to this session — do not name one'),
      expect.anything(),
    );
    expect(llm.complete).toHaveBeenCalledWith(
      expect.stringContaining('never state a specific model name or version'),
      expect.anything(),
    );
  });

  it('injects a fallback-aware note when the prior turn actually switched providers', async () => {
    const llm = mockLlm('Hello!');
    const engine = new ConversationEngine({ llm, projectName: 'test' });

    await engine.processTurn('hello', [], {
      priorProviderContext: {
        provider: 'claude',
        model: 'claude-sonnet-4-6',
        switchedFrom: 'codex',
        switchReason: 'rate_limited',
      },
    });

    const [prompt] = (llm.complete as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(prompt).toContain('That completed turn used an automatic fallback');
    expect(prompt).toContain('the configured provider "codex" was rate-limited');
    expect(prompt).toContain('retried against "claude"');
    expect(prompt).toContain('answer truthfully using these facts');
    expect(prompt).toContain('do not present this historical status as the provider for the current request');
  });
});

describe('formatProviderTransparencyNote', () => {
  it('describes the current provider plainly when there was no fallback', () => {
    const note = formatProviderTransparencyNote({ provider: 'claude', model: 'claude-sonnet-4-6' });
    expect(note).toContain('"claude"');
    expect(note).toContain('claude-sonnet-4-6');
    expect(note).not.toContain('fallback');
  });

  it('explicitly forbids naming a model version when none is known, rather than staying silent', () => {
    const note = formatProviderTransparencyNote({ provider: 'claude' });
    expect(note).toContain('"claude"');
    expect(note).toContain('not exposed to this session — do not name one');
    expect(note).toContain('never state a specific model name or version');
  });

  it('explains a rate-limit fallback', () => {
    const note = formatProviderTransparencyNote({
      provider: 'claude',
      switchedFrom: 'codex',
      switchReason: 'rate_limited',
    });
    expect(note).toContain('"codex" was rate-limited');
  });

  it('explains an unavailable-provider fallback', () => {
    const note = formatProviderTransparencyNote({
      provider: 'claude',
      switchedFrom: 'codex',
      switchReason: 'unavailable',
    });
    expect(note).toContain('"codex" was unavailable');
  });

  it('falls back to a generic reason for an unrecognized switchReason', () => {
    const note = formatProviderTransparencyNote({
      provider: 'claude',
      switchedFrom: 'codex',
      switchReason: 'some_future_reason',
    });
    expect(note).toContain('"codex" was unavailable');
  });
});
