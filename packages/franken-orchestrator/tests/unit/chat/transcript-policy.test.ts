import { describe, it, expect, vi } from 'vitest';
import { TranscriptPolicy } from '../../../src/chat/transcript-policy.js';
import type { ILlmClient } from '@franken/core';
import type { TranscriptMessage } from '../../../src/chat/types.js';

function mockLlm(summary = 'Summary of earlier conversation.'): ILlmClient {
  return { complete: vi.fn().mockResolvedValue(summary) };
}

function makeMessage(
  role: TranscriptMessage['role'],
  content: string,
): TranscriptMessage {
  return { role, content, timestamp: new Date().toISOString() };
}

describe('TranscriptPolicy', () => {
  it('does nothing when transcript is under limit', async () => {
    const llm = mockLlm();
    const policy = new TranscriptPolicy(llm, { maxMessages: 10 });
    const messages: TranscriptMessage[] = [makeMessage('user', 'Hello')];

    const result = await policy.enforce(messages);
    expect(result).toHaveLength(1);
    expect(llm.complete).not.toHaveBeenCalled();
  });

  it('summarizes oldest messages when over limit', async () => {
    const llm = mockLlm('Condensed history.');
    const policy = new TranscriptPolicy(llm, { maxMessages: 3 });
    const messages: TranscriptMessage[] = Array.from({ length: 6 }, (_, i) =>
      makeMessage(i % 2 === 0 ? 'user' : 'assistant', `Message ${i}`),
    );

    const result = await policy.enforce(messages);
    // summary + last 3 messages
    expect(result.length).toBeLessThanOrEqual(4);
    expect(result[0]!.role).toBe('system');
    expect(result[0]!.content).toContain('Condensed history');
    expect(llm.complete).toHaveBeenCalled();
  });

  it('preserves safety-relevant messages in summary prompt', async () => {
    const llm = mockLlm();
    const policy = new TranscriptPolicy(llm, { maxMessages: 2 });
    const messages: TranscriptMessage[] = [
      makeMessage('user', 'Delete everything'),
      makeMessage('assistant', 'Pending approval for deletion'),
      makeMessage('user', 'Approved'),
      makeMessage('user', 'New topic'),
    ];

    await policy.enforce(messages);
    const prompt = (llm.complete as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as string;
    expect(prompt).toContain('approval');
  });

  it('returns exactly maxMessages + 1 (summary) when over limit', async () => {
    const llm = mockLlm('Summary.');
    const policy = new TranscriptPolicy(llm, { maxMessages: 3 });
    const messages: TranscriptMessage[] = Array.from({ length: 10 }, (_, i) =>
      makeMessage(i % 2 === 0 ? 'user' : 'assistant', `Msg ${i}`),
    );

    const result = await policy.enforce(messages);
    expect(result).toHaveLength(4); // 1 summary + 3 kept
  });

  it('does nothing when transcript equals limit exactly', async () => {
    const llm = mockLlm();
    const policy = new TranscriptPolicy(llm, { maxMessages: 3 });
    const messages: TranscriptMessage[] = [
      makeMessage('user', 'A'),
      makeMessage('assistant', 'B'),
      makeMessage('user', 'C'),
    ];

    const result = await policy.enforce(messages);
    expect(result).toHaveLength(3);
    expect(llm.complete).not.toHaveBeenCalled();
  });

  it('includes safety keywords in summary prompt', async () => {
    const llm = mockLlm();
    const policy = new TranscriptPolicy(llm, { maxMessages: 2 });
    const messages: TranscriptMessage[] = [
      makeMessage('assistant', 'Error: file not found'),
      makeMessage('assistant', 'Files changed: src/a.ts'),
      makeMessage('user', 'ok'),
      makeMessage('user', 'next'),
    ];

    await policy.enforce(messages);
    const prompt = (llm.complete as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as string;
    expect(prompt).toContain('error');
    expect(prompt).toContain('files changed');
  });
});
