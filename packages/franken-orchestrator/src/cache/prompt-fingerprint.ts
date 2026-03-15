import { createHash } from 'node:crypto';

function normalizeInput(input: string): string {
  return input.replace(/\r\n/g, '\n').trim();
}

export function createPromptFingerprint(input: string): string {
  return createHash('sha256')
    .update(normalizeInput(input), 'utf8')
    .digest('hex');
}
