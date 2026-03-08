import { describe, it, expect, vi } from 'vitest';
import { ReflectionEngine } from '../../../src/reflection/reflection-engine.js';
import type { ILlmClient, Result } from '../../../src/reflection/types.js';
import type { IMemoryModule } from '../../../src/modules/memory.js';
import type { IObservabilityModule } from '../../../src/modules/observability.js';
import { buildReflectionPrompt } from '../../../src/reflection/prompt-builder.js';
import { parseReflectionResponse } from '../../../src/reflection/response-parser.js';

// ─── Valid reflection JSON (all mocks return this, formatted differently) ────

const REFLECTION_DATA = {
  patterns: ['repeated API failures in auth module'],
  improvements: [
    { target: 'auth', description: 'add retry with exponential backoff', priority: 'high' as const },
  ],
  techDebt: [
    { location: '/src/auth', description: 'inline SQL queries', effort: 'medium' as const },
  ],
};

// ─── Mock LLM Implementations ───────────────────────────────────────────────

/** Claude-like: returns clean JSON */
function makeClaudeLikeMock(): ILlmClient {
  return {
    complete: vi.fn(async (): Promise<Result<string>> => ({
      ok: true,
      value: JSON.stringify(REFLECTION_DATA),
    })),
  };
}

/** OpenAI-like: wraps JSON in a markdown code block */
function makeOpenAILikeMock(): ILlmClient {
  return {
    complete: vi.fn(async (): Promise<Result<string>> => ({
      ok: true,
      value: '```json\n' + JSON.stringify(REFLECTION_DATA, null, 2) + '\n```',
    })),
  };
}

/** Local LLM: returns JSON with some extra whitespace/newlines */
function makeLocalLlmMock(): ILlmClient {
  return {
    complete: vi.fn(async (): Promise<Result<string>> => ({
      ok: true,
      value: '\n\n' + JSON.stringify(REFLECTION_DATA) + '\n',
    })),
  };
}

/** Failing LLM: returns error Result */
function makeFailingMock(): ILlmClient {
  return {
    complete: vi.fn(async (): Promise<Result<string>> => ({
      ok: false,
      error: new Error('Connection refused'),
    })),
  };
}

// ─── Shared Stubs ────────────────────────────────────────────────────────────

function makeMemoryStub(): IMemoryModule {
  return {
    getRecentTraces: vi.fn().mockResolvedValue([
      { id: 'e1', taskId: 't1', status: 'failure', summary: 'Auth failed', timestamp: '2026-01-01T00:00:00Z' },
    ]),
    getSuccesses: vi.fn().mockResolvedValue([
      { id: 's1', content: 'Deployed v2', source: 'episodic', timestamp: '2026-01-01T01:00:00Z' },
    ]),
    getFailures: vi.fn().mockResolvedValue([
      { id: 'f1', content: 'Auth token expired', source: 'episodic', timestamp: '2026-01-01T00:30:00Z' },
    ]),
    recordLesson: vi.fn().mockResolvedValue(undefined),
  };
}

function makeObsStub(): IObservabilityModule {
  return {
    getTraces: vi.fn().mockResolvedValue([
      { id: 't1', spanCount: 3, status: 'error', durationMs: 500, timestamp: '2026-01-01T00:00:00Z' },
    ]),
    getTokenSpend: vi.fn().mockResolvedValue({
      totalTokens: 5000,
      totalCostUsd: 0.25,
      breakdown: [],
    }),
  };
}

// ─── ReflectionEngine: Cross-Provider Tests ─────────────────────────────────

describe('ReflectionEngine: Provider-agnostic behaviour', () => {
  const mocks: Array<[string, () => ILlmClient]> = [
    ['Claude-like (clean JSON)', makeClaudeLikeMock],
    ['OpenAI-like (markdown code block)', makeOpenAILikeMock],
    ['Local LLM (extra whitespace)', makeLocalLlmMock],
  ];

  for (const [name, factory] of mocks) {
    describe(`with ${name} mock`, () => {
      it('produces a successful ReflectionResult', async () => {
        const engine = new ReflectionEngine({
          llm: factory(),
          memory: makeMemoryStub(),
          observability: makeObsStub(),
          maxReflectionTokens: 4096,
        });

        const result = await engine.reflect('test-project');
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.patterns).toContain('repeated API failures in auth module');
          expect(result.value.improvements).toHaveLength(1);
          expect(result.value.improvements[0]!.target).toBe('auth');
          expect(result.value.techDebt).toHaveLength(1);
        }
      });

      it('calls complete() with maxTokens option', async () => {
        const llm = factory();
        const engine = new ReflectionEngine({
          llm,
          memory: makeMemoryStub(),
          observability: makeObsStub(),
          maxReflectionTokens: 2048,
        });

        await engine.reflect('test-project');
        expect(llm.complete).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ maxTokens: 2048 }),
        );
      });

      it('queries memory for project-specific data', async () => {
        const memory = makeMemoryStub();
        const engine = new ReflectionEngine({
          llm: factory(),
          memory,
          observability: makeObsStub(),
          maxReflectionTokens: 4096,
        });

        await engine.reflect('my-project');
        expect(memory.getFailures).toHaveBeenCalledWith('my-project');
        expect(memory.getSuccesses).toHaveBeenCalledWith('my-project');
      });
    });
  }

  it('handles LLM failure gracefully regardless of provider', async () => {
    const engine = new ReflectionEngine({
      llm: makeFailingMock(),
      memory: makeMemoryStub(),
      observability: makeObsStub(),
      maxReflectionTokens: 4096,
    });

    const result = await engine.reflect('test-project');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('LLM');
    }
  });
});

// ─── Prompt Builder: Provider-Agnostic Verification ─────────────────────────

describe('Prompt builder is provider-agnostic', () => {
  it('buildReflectionPrompt returns plain text, not a message array', () => {
    const prompt = buildReflectionPrompt({
      traces: [{ id: 't1', spanCount: 2, status: 'error', durationMs: 100, timestamp: '2026-01-01T00:00:00Z' }],
      failures: [{ id: 'f1', content: 'Auth failed', source: 'episodic', timestamp: '2026-01-01T00:00:00Z' }],
      successes: [],
    });

    expect(typeof prompt).toBe('string');
    // Must not be a JSON array (provider-specific message format)
    expect(prompt).not.toMatch(/^\s*\[/);
    // Contains structured sections
    expect(prompt).toContain('patterns');
    expect(prompt).toContain('improvements');
    expect(prompt).toContain('tech debt');
    expect(prompt).toContain('JSON');
  });
});

// ─── Response Parser: Provider-Agnostic Verification ─────────────────────────

describe('Response parser handles diverse LLM output formats', () => {
  it('parses raw JSON', () => {
    const result = parseReflectionResponse(JSON.stringify(REFLECTION_DATA));
    expect(result.ok).toBe(true);
  });

  it('parses JSON wrapped in markdown code block', () => {
    const result = parseReflectionResponse(
      '```json\n' + JSON.stringify(REFLECTION_DATA) + '\n```',
    );
    expect(result.ok).toBe(true);
  });

  it('parses JSON with leading/trailing whitespace', () => {
    const result = parseReflectionResponse(
      '\n  ' + JSON.stringify(REFLECTION_DATA) + '  \n',
    );
    expect(result.ok).toBe(true);
  });

  it('rejects malformed JSON', () => {
    const result = parseReflectionResponse('not json at all {{{');
    expect(result.ok).toBe(false);
  });

  it('rejects valid JSON with wrong schema', () => {
    const result = parseReflectionResponse(JSON.stringify({ wrong: 'shape' }));
    expect(result.ok).toBe(false);
  });
});
