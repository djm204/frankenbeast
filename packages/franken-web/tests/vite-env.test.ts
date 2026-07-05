import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('browser operator token plumbing', () => {
  it('does not keep a Vite helper that resolves backend operator tokens for the browser', () => {
    const helperPath = join(process.cwd(), 'vite-env.ts');
    expect(existsSync(helperPath)).toBe(false);
  });

  it('does not reference VITE_BEAST_OPERATOR_TOKEN from app source', () => {
    const appSource = readFileSync(join(process.cwd(), 'src/app.tsx'), 'utf8');
    expect(appSource).not.toContain('VITE_BEAST_OPERATOR_TOKEN');
  });
});
