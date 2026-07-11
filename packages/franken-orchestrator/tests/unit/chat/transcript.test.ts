import { describe, it, expect, beforeEach } from 'vitest';
import { Transcript } from '../../../src/chat/transcript.js';
import { ModelTier } from '../../../src/chat/types.js';
import type { TranscriptMessage } from '../../../src/chat/types.js';

describe('Transcript', () => {
  let transcript: Transcript;

  beforeEach(() => {
    transcript = new Transcript();
  });

  it('starts empty', () => {
    expect(transcript.messages()).toEqual([]);
  });

  it('appends messages with auto-timestamp', () => {
    transcript.append({ role: 'user', content: 'Hello' });
    const msgs = transcript.messages();
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.role).toBe('user');
    expect(msgs[0]!.content).toBe('Hello');
    expect(msgs[0]!.timestamp).toBeDefined();
  });

  it('preserves insertion order', () => {
    transcript.append({ role: 'user', content: 'First' });
    transcript.append({ role: 'assistant', content: 'Second', modelTier: ModelTier.Cheap });
    transcript.append({ role: 'user', content: 'Third' });
    expect(transcript.messages().map(m => m.content)).toEqual(['First', 'Second', 'Third']);
  });

  it('tracks token counts by model tier', () => {
    transcript.append({ role: 'assistant', content: 'Short reply', modelTier: ModelTier.Cheap, tokens: 10 });
    transcript.append({ role: 'assistant', content: 'Deep analysis', modelTier: ModelTier.PremiumReasoning, tokens: 500 });
    transcript.append({ role: 'assistant', content: 'Code output', modelTier: ModelTier.PremiumExecution, tokens: 200 });

    const totals = transcript.tokensByTier();
    expect(totals.cheap).toBe(10);
    expect(totals.premiumReasoning).toBe(500);
    expect(totals.premiumExecution).toBe(200);
  });

  it('returns defensive message copies so callers cannot mutate internal state', () => {
    transcript.append({ role: 'assistant', content: 'Short reply', modelTier: ModelTier.Cheap, tokens: 10 });

    const returned = transcript.messages()[0]!;
    returned.content = 'tampered';
    returned.tokens = 999_999;
    returned.modelTier = ModelTier.PremiumExecution;

    expect(transcript.messages()[0]).toMatchObject({
      role: 'assistant',
      content: 'Short reply',
      modelTier: ModelTier.Cheap,
      tokens: 10,
    });
    expect(transcript.tokensByTier()).toEqual({
      cheap: 10,
      premiumReasoning: 0,
      premiumExecution: 0,
    });
  });

  it('initializes from existing messages array', () => {
    const existing = [
      { role: 'user' as const, content: 'Hi', timestamp: new Date().toISOString() },
    ];
    const t = Transcript.fromMessages(existing);
    expect(t.messages()).toHaveLength(1);
  });

  it('copies source message objects when initializing from existing messages', () => {
    const existing: TranscriptMessage[] = [
      {
        role: 'assistant',
        content: 'Original',
        timestamp: new Date().toISOString(),
        modelTier: ModelTier.PremiumReasoning,
        tokens: 42,
      },
    ];

    const t = Transcript.fromMessages(existing);
    existing[0]!.content = 'tampered';
    existing[0]!.tokens = 999_999;
    existing[0]!.modelTier = ModelTier.Cheap;

    expect(t.messages()[0]).toMatchObject({
      role: 'assistant',
      content: 'Original',
      modelTier: ModelTier.PremiumReasoning,
      tokens: 42,
    });
    expect(t.tokensByTier()).toEqual({
      cheap: 0,
      premiumReasoning: 42,
      premiumExecution: 0,
    });
  });
});
