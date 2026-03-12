import { describe, it, expect } from 'vitest';
import { PromptBuilder } from '../../../src/chat/prompt-builder.js';

describe('PromptBuilder', () => {
  it('builds a prompt from transcript messages', () => {
    const builder = new PromptBuilder({ projectName: 'my-app', maxMessages: 10 });
    const messages = [
      { role: 'user' as const, content: 'Hello', timestamp: new Date().toISOString() },
      { role: 'assistant' as const, content: 'Hi!', timestamp: new Date().toISOString() },
      { role: 'user' as const, content: 'Fix the bug', timestamp: new Date().toISOString() },
    ];

    const prompt = builder.build(messages);
    expect(prompt).toContain('my-app');
    expect(prompt).toContain('Hello');
    expect(prompt).toContain('Hi!');
    expect(prompt).toContain('Fix the bug');
  });

  it('truncates to maxMessages, keeping system context', () => {
    const builder = new PromptBuilder({ projectName: 'app', maxMessages: 2 });
    const messages = Array.from({ length: 10 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `Message ${i}`,
      timestamp: new Date().toISOString(),
    }));

    const prompt = builder.build(messages);
    expect(prompt).not.toContain('Message 0');
    expect(prompt).toContain('Message 9');
  });

  it('includes system context about the project', () => {
    const builder = new PromptBuilder({ projectName: 'frankenbeast' });
    const prompt = builder.build([]);
    expect(prompt).toContain('frankenbeast');
  });

  it('includes the Frankenbeast identity and persona boundaries', () => {
    const builder = new PromptBuilder({ projectName: 'frankenbeast' });

    const prompt = builder.build([]);

    expect(prompt).toContain('You are Frankenbeast');
    expect(prompt).toContain('Do not describe yourself as Claude, Codex, or any underlying model or provider');
    expect(prompt).toContain('accomplish the task at hand exactly to spec');
    expect(prompt).toContain('helpful and critical when needed');
    expect(prompt).toContain('must not override task-specific skills, workflow requirements, or safety constraints');
  });
});
