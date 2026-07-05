import { createHash } from 'node:crypto';

export function hashContent(content: string | Buffer): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}
