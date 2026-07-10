import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/hooks/use-chat-session.ts'), 'utf8');

describe('useChatSession source hygiene', () => {
  it('keeps the send implementation free of unresolved patch markers', () => {
    const sendStart = source.indexOf('async function send(content: string): Promise<void> {');
    const retryStart = source.indexOf('async function retryMessage(messageId: string): Promise<void> {', sendStart);

    expect(sendStart).toBeGreaterThanOrEqual(0);
    expect(retryStart).toBeGreaterThan(sendStart);

    const sendImplementation = source.slice(sendStart, retryStart);
    expect(sendImplementation).not.toMatch(/^\s*\+\s*(?:\/\/|const|if|try|catch|socket|set|return|throw|await)\b/m);
  });
});
