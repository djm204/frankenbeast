export interface WatchlistItem {
  readonly checked: boolean;
  readonly description: string;
}

export interface ReflectionEntry {
  readonly label: string;
  readonly content: string;
}

export interface UnknownSection {
  readonly heading: string;
  readonly content: string;
}

export interface ChecklistParseResult {
  readonly watchlist: WatchlistItem[];
  readonly reflections: ReflectionEntry[];
  readonly unknownSections: UnknownSection[];
  readonly warnings: string[];
}

const WATCHLIST_HEADING = 'Active Watchlist';
const REFLECTION_HEADING = 'Reflection Log';
const CHECKBOX_RE = /^- \[([ x])\] (.+)$/;
const REFLECTION_RE = /^- \*([^:]+):\* (.+)$/;

type SectionName = typeof WATCHLIST_HEADING | typeof REFLECTION_HEADING | string;

interface RawSection {
  heading: string;
  lines: string[];
}

function splitSections(input: string): RawSection[] {
  const sections: RawSection[] = [];
  let current: RawSection | null = null;

  for (const line of input.split('\n')) {
    const headingMatch = /^## (.+)$/.exec(line);
    if (headingMatch?.[1] !== undefined) {
      if (current) sections.push(current);
      current = { heading: headingMatch[1], lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }

  if (current) sections.push(current);
  return sections;
}

function parseWatchlistLines(lines: string[], warnings: string[]): WatchlistItem[] {
  const items: WatchlistItem[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') continue;

    const match = CHECKBOX_RE.exec(trimmed);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      items.push({
        checked: match[1] === 'x',
        description: match[2],
      });
    } else {
      warnings.push(`Skipped malformed watchlist line: "${trimmed}"`);
    }
  }

  return items;
}

function parseReflectionLines(lines: string[], warnings: string[]): ReflectionEntry[] {
  const entries: ReflectionEntry[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') continue;

    const match = REFLECTION_RE.exec(trimmed);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      entries.push({
        label: match[1],
        content: match[2],
      });
    } else {
      warnings.push(`Skipped malformed reflection line: "${trimmed}"`);
    }
  }

  return entries;
}

export function parseChecklist(input: string): ChecklistParseResult {
  if (input.trim() === '') {
    return { watchlist: [], reflections: [], unknownSections: [], warnings: [] };
  }

  const sections = splitSections(input);
  const warnings: string[] = [];
  let watchlist: WatchlistItem[] = [];
  let reflections: ReflectionEntry[] = [];
  const unknownSections: UnknownSection[] = [];

  for (const section of sections) {
    if (section.heading === WATCHLIST_HEADING) {
      watchlist = parseWatchlistLines(section.lines, warnings);
    } else if (section.heading === REFLECTION_HEADING) {
      reflections = parseReflectionLines(section.lines, warnings);
    } else {
      unknownSections.push({
        heading: section.heading,
        content: section.lines.join('\n').trim(),
      });
    }
  }

  return { watchlist, reflections, unknownSections, warnings };
}
