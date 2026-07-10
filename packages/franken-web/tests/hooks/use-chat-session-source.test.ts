import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/hooks/use-chat-session.ts'), 'utf8');

describe('useChatSession source hygiene', () => {
  const patchAdditionMarker = new RegExp(`^\\s*${'\\+'}\\s*(?:\\/\\/|const|if|try|catch|socket|set\\w*|return|throw|await|for|function)\\b`, 'm');

  it('matches unresolved patch markers before setter calls', () => {
    expect("+        setStatus('idle')").toMatch(patchAdditionMarker);
    expect("+        setConnectionStatus('reconnecting')").toMatch(patchAdditionMarker);
  });

  it('keeps the send implementation free of unresolved patch markers', () => {
    const sendStart = source.indexOf('async function send(content: string): Promise<void> {');
    const retryStart = source.indexOf('async function retryMessage(messageId: string): Promise<void> {', sendStart);

    expect(sendStart).toBeGreaterThanOrEqual(0);
    expect(retryStart).toBeGreaterThan(sendStart);

    const sendImplementation = source.slice(sendStart, retryStart);
    expect(sendImplementation).not.toMatch(patchAdditionMarker);
  });

  it('keeps session refresh recovery code free of unresolved patch markers', () => {
    const pendingSendStart = source.indexOf('function failPendingSend(');
    const retryErrorStart = source.indexOf('async function retryError(id: string): Promise<string | undefined> {', pendingSendStart);

    expect(pendingSendStart).toBeGreaterThanOrEqual(0);
    expect(retryErrorStart).toBeGreaterThan(pendingSendStart);

    const recoveryImplementation = source.slice(pendingSendStart, retryErrorStart);
    expect(recoveryImplementation).not.toMatch(patchAdditionMarker);
  });
});
