import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CLIENT_SOURCES = [
  'src/lib/network-api.ts',
  'src/lib/beast-api.ts',
  'src/lib/dashboard-api.ts',
  'src/lib/analytics-api.ts',
  'src/components/chat-shell.tsx',
];

describe('browser control-plane clients', () => {
  it('do not read or attach long-lived operator-token credentials', () => {
    for (const sourcePath of CLIENT_SOURCES) {
      const source = readFileSync(join(process.cwd(), sourcePath), 'utf8');
      expect(source, sourcePath).not.toContain('VITE_BEAST_OPERATOR_TOKEN');
      expect(source, sourcePath).not.toContain('FRANKENBEAST_BEAST_OPERATOR_TOKEN');
      expect(source, sourcePath).not.toContain('x-frankenbeast-operator-token');
      expect(source, sourcePath).not.toMatch(/Authorization\s*[:=]/i);
      expect(source, sourcePath).not.toMatch(/Bearer\s+\$?\{?/i);
    }
  });
});
