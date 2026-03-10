import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appCss = readFileSync(resolve(process.cwd(), 'src/styles/app.css'), 'utf8');

describe('app.css sidebar controls', () => {
  it('keeps the sidebar close button hidden by default and only shows it on mobile', () => {
    expect(appCss).toMatch(/\.sidebar__toggle,\s*\.sidebar__close\s*\{\s*display:\s*none;\s*\}/m);
    expect(appCss).toMatch(/@media\s*\(max-width:\s*920px\)\s*\{[\s\S]*?\.sidebar__toggle\s*\{\s*display:\s*inline-flex;\s*\}[\s\S]*?\.sidebar__close\s*\{\s*display:\s*inline-flex;\s*\}/m);
    expect(appCss).toMatch(/@media\s*\(min-width:\s*921px\)\s*\{[\s\S]*?\.sidebar__close\s*\{\s*display:\s*none;\s*\}/m);
  });
});
