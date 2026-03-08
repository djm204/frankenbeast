import type { WatchlistItem, ReflectionEntry, UnknownSection } from './parser.js';

export interface WriteChecklistInput {
  readonly watchlist: readonly WatchlistItem[];
  readonly reflections: readonly ReflectionEntry[];
  readonly unknownSections: readonly UnknownSection[];
}

function formatWatchlistSection(items: readonly WatchlistItem[]): string {
  if (items.length === 0) return '';
  const lines = items.map((item) => {
    const checkbox = item.checked ? '[x]' : '[ ]';
    return `- ${checkbox} ${item.description}`;
  });
  return `## Active Watchlist\n${lines.join('\n')}`;
}

function formatReflectionSection(entries: readonly ReflectionEntry[]): string {
  if (entries.length === 0) return '';
  const lines = entries.map((entry) => `- *${entry.label}:* ${entry.content}`);
  return `## Reflection Log\n${lines.join('\n')}`;
}

function formatUnknownSection(section: UnknownSection): string {
  return `## ${section.heading}\n${section.content}`;
}

export function writeChecklist(input: WriteChecklistInput): string {
  const sections: string[] = [];

  const watchlist = formatWatchlistSection(input.watchlist);
  if (watchlist) sections.push(watchlist);

  for (const section of input.unknownSections) {
    sections.push(formatUnknownSection(section));
  }

  const reflections = formatReflectionSection(input.reflections);
  if (reflections) sections.push(reflections);

  return sections.join('\n\n') + (sections.length > 0 ? '\n' : '');
}
