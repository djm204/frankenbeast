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

describe('app.css transcript message formatting', () => {
  it('preserves transcript newlines and wraps long unbroken output', () => {
    expect(appCss).toMatch(/\.message-card__content\s*\{[\s\S]*?white-space:\s*pre-wrap;[\s\S]*?overflow-wrap:\s*anywhere;[\s\S]*?\}/m);
  });
});

describe('app.css smart-swarm dashboard', () => {
  it('keeps topology responsive and disables decorative motion when requested', () => {
    expect(appCss).toMatch(/\.smart-swarm-layout\s*\{[\s\S]*?grid-template-columns:/m);
    expect(appCss).toMatch(/@media\s*\(max-width:\s*1100px\)\s*\{[\s\S]*?\.smart-swarm-layout\s*\{\s*grid-template-columns:\s*1fr;/m);
    expect(appCss).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.smart-swarm-connection/m);
    expect(appCss).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.runtime-brain-pulse\[data-pulse-state="active"\][\s\S]*?animation:\s*none;/m);
  });

  it('wraps long normalized pulse evidence without expanding the dashboard', () => {
    expect(appCss).toMatch(/\.runtime-brain-pulse li span\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?overflow-wrap:\s*anywhere;/m);
  });
});
