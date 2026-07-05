import { createHash } from 'node:crypto';

export function hashContent(content: string | Buffer): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

export function contentHashMatches(content: string | Buffer, expected: string): boolean {
  const actual = hashContent(content);
  return actual === expected || actual === `sha256:${expected}`;
}
