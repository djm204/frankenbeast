import { describe, it, expect } from 'vitest';
import { parseChecklist, type WatchlistItem, type ReflectionEntry } from '../../../src/checklist/parser.js';

const SAMPLE_HEARTBEAT = `## Active Watchlist
- [ ] Monitor CI for 'Staples-UI' branch.
- [ ] Daily 2AM: Refactor any 'TODO' comments in \`/src/services\`.
- [x] Alert if token spend > $5.00 today.

## Reflection Log
- *Yesterday:* Refactored 3 components. 100% test pass.
- *Issue:* Slow response on Jira skill.
- *Improvement:* Cache Jira metadata in MOD-03.`;

describe('parseChecklist', () => {
  it('parses empty string into empty watchlist and reflection log', () => {
    const result = parseChecklist('');
    expect(result.watchlist).toEqual([]);
    expect(result.reflections).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('parses unchecked watchlist items', () => {
    const result = parseChecklist(SAMPLE_HEARTBEAT);
    const unchecked = result.watchlist.filter((item) => !item.checked);
    expect(unchecked).toHaveLength(2);
  });

  it('parses checked watchlist items', () => {
    const result = parseChecklist(SAMPLE_HEARTBEAT);
    const checked = result.watchlist.filter((item) => item.checked);
    expect(checked).toHaveLength(1);
    expect(checked[0]?.description).toContain('Alert if token spend');
  });

  it('extracts description text from watchlist items', () => {
    const result = parseChecklist(SAMPLE_HEARTBEAT);
    expect(result.watchlist[0]?.description).toBe("Monitor CI for 'Staples-UI' branch.");
  });

  it('parses reflection log entries with label prefix', () => {
    const result = parseChecklist(SAMPLE_HEARTBEAT);
    expect(result.reflections).toHaveLength(3);
    expect(result.reflections[0]?.label).toBe('Yesterday');
    expect(result.reflections[0]?.content).toBe('Refactored 3 components. 100% test pass.');
  });

  it('handles file with only watchlist section', () => {
    const input = `## Active Watchlist\n- [ ] Task one\n- [x] Task two`;
    const result = parseChecklist(input);
    expect(result.watchlist).toHaveLength(2);
    expect(result.reflections).toEqual([]);
  });

  it('handles file with only reflection section', () => {
    const input = `## Reflection Log\n- *Note:* Something happened.`;
    const result = parseChecklist(input);
    expect(result.watchlist).toEqual([]);
    expect(result.reflections).toHaveLength(1);
  });

  it('handles malformed lines gracefully with warnings', () => {
    const input = `## Active Watchlist\n- [ ] Valid item\nThis is a malformed line\n- [ ] Another valid item`;
    const result = parseChecklist(input);
    expect(result.watchlist).toHaveLength(2);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('malformed');
  });

  it('preserves unknown sections as passthrough', () => {
    const input = `## Active Watchlist\n- [ ] Task\n\n## Custom Section\nSome custom content\n\n## Reflection Log\n- *Note:* Entry`;
    const result = parseChecklist(input);
    expect(result.watchlist).toHaveLength(1);
    expect(result.reflections).toHaveLength(1);
    expect(result.unknownSections).toHaveLength(1);
    expect(result.unknownSections[0]?.heading).toBe('Custom Section');
    expect(result.unknownSections[0]?.content).toContain('Some custom content');
  });
});
