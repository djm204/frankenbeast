import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const chatShellSourcePath = resolve(process.cwd(), 'src/components/chat-shell.tsx');
const chatShellSource = readFileSync(chatShellSourcePath, 'utf8');

const extractedModules = [
  'route-model.ts',
  'session-labels.ts',
  'sidebar-focus.ts',
  'chat-error-banners.tsx',
  'placeholder-page.tsx',
  'beast-log-utils.ts',
  'network-error.ts',
];

describe('ChatShell source decomposition', () => {
  it('keeps extracted route, sidebar, alert, session-label, network, and Beast log concerns in small modules', () => {
    for (const fileName of extractedModules) {
      const modulePath = resolve(process.cwd(), 'src/components/chat-shell', fileName);
      expect(existsSync(modulePath)).toBe(true);
      const lineCount = readFileSync(modulePath, 'utf8').split('\n').length;
      expect(lineCount).toBeLessThan(80);
    }
  });

  it('keeps the ChatShell component below the historical god-component size', () => {
    expect(chatShellSource.split('\n').length).toBeLessThan(1300);
  });
});
