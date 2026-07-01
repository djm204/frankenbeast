import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('sandbox Dockerfile', () => {
  const dockerfile = readFileSync(resolve('Dockerfile'), 'utf8');

  it('builds the fbeast/sandbox image from an in-repo Node runtime Dockerfile', () => {
    expect(dockerfile).toContain('FROM node:22-bookworm-slim');
    expect(dockerfile).toContain('WORKDIR /workspace');
  });

  it('declares a non-root default container UID', () => {
    const userLine = dockerfile.split('\n').find((line) => line.startsWith('USER '));

    expect(userLine).toBeDefined();
    expect(userLine).not.toBe('USER root');
    expect(userLine).not.toBe('USER 0');
    expect(userLine?.split(/\s+/)[1]?.split(':')[0]).not.toBe('0');
  });
});
