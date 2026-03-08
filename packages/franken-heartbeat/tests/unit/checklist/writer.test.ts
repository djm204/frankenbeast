import { describe, it, expect } from 'vitest';
import { writeChecklist } from '../../../src/checklist/writer.js';
import type { WatchlistItem, ReflectionEntry, UnknownSection } from '../../../src/checklist/parser.js';

describe('writeChecklist', () => {
  it('serializes watchlist items to markdown', () => {
    const watchlist: WatchlistItem[] = [
      { checked: false, description: 'Task one' },
      { checked: true, description: 'Task two' },
    ];
    const result = writeChecklist({ watchlist, reflections: [], unknownSections: [] });
    expect(result).toContain('- [ ] Task one');
    expect(result).toContain('- [x] Task two');
  });

  it('marks completed items with [x]', () => {
    const watchlist: WatchlistItem[] = [
      { checked: true, description: 'Done task' },
    ];
    const result = writeChecklist({ watchlist, reflections: [], unknownSections: [] });
    expect(result).toContain('- [x] Done task');
  });

  it('serializes reflection entries to markdown', () => {
    const reflections: ReflectionEntry[] = [
      { label: 'Yesterday', content: 'Refactored 3 components.' },
      { label: 'Issue', content: 'Slow response.' },
    ];
    const result = writeChecklist({ watchlist: [], reflections, unknownSections: [] });
    expect(result).toContain('- *Yesterday:* Refactored 3 components.');
    expect(result).toContain('- *Issue:* Slow response.');
  });

  it('preserves unknown sections', () => {
    const unknownSections: UnknownSection[] = [
      { heading: 'Custom Section', content: 'Some custom content' },
    ];
    const result = writeChecklist({ watchlist: [], reflections: [], unknownSections });
    expect(result).toContain('## Custom Section');
    expect(result).toContain('Some custom content');
  });

  it('writes sections in order: watchlist, unknown, reflections', () => {
    const watchlist: WatchlistItem[] = [{ checked: false, description: 'Task' }];
    const reflections: ReflectionEntry[] = [{ label: 'Note', content: 'Entry' }];
    const unknownSections: UnknownSection[] = [{ heading: 'Custom', content: 'Content' }];
    const result = writeChecklist({ watchlist, reflections, unknownSections });

    const watchlistPos = result.indexOf('## Active Watchlist');
    const customPos = result.indexOf('## Custom');
    const reflectionPos = result.indexOf('## Reflection Log');
    expect(watchlistPos).toBeLessThan(customPos);
    expect(customPos).toBeLessThan(reflectionPos);
  });

  it('produces empty string for empty input', () => {
    const result = writeChecklist({ watchlist: [], reflections: [], unknownSections: [] });
    expect(result.trim()).toBe('');
  });

  it('appends a new reflection entry', () => {
    const reflections: ReflectionEntry[] = [
      { label: 'Old', content: 'Previous entry.' },
      { label: 'New', content: 'Fresh entry.' },
    ];
    const result = writeChecklist({ watchlist: [], reflections, unknownSections: [] });
    expect(result).toContain('- *Old:* Previous entry.');
    expect(result).toContain('- *New:* Fresh entry.');
  });
});
