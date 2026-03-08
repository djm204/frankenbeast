const WATCHLIST_HEADING = 'Active Watchlist';
const REFLECTION_HEADING = 'Reflection Log';
const CHECKBOX_RE = /^- \[([ x])\] (.+)$/;
const REFLECTION_RE = /^- \*([^:]+):\* (.+)$/;
function splitSections(input) {
    const sections = [];
    let current = null;
    for (const line of input.split('\n')) {
        const headingMatch = /^## (.+)$/.exec(line);
        if (headingMatch?.[1] !== undefined) {
            if (current)
                sections.push(current);
            current = { heading: headingMatch[1], lines: [] };
        }
        else if (current) {
            current.lines.push(line);
        }
    }
    if (current)
        sections.push(current);
    return sections;
}
function parseWatchlistLines(lines, warnings) {
    const items = [];
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === '')
            continue;
        const match = CHECKBOX_RE.exec(trimmed);
        if (match?.[1] !== undefined && match[2] !== undefined) {
            items.push({
                checked: match[1] === 'x',
                description: match[2],
            });
        }
        else {
            warnings.push(`Skipped malformed watchlist line: "${trimmed}"`);
        }
    }
    return items;
}
function parseReflectionLines(lines, warnings) {
    const entries = [];
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === '')
            continue;
        const match = REFLECTION_RE.exec(trimmed);
        if (match?.[1] !== undefined && match[2] !== undefined) {
            entries.push({
                label: match[1],
                content: match[2],
            });
        }
        else {
            warnings.push(`Skipped malformed reflection line: "${trimmed}"`);
        }
    }
    return entries;
}
export function parseChecklist(input) {
    if (input.trim() === '') {
        return { watchlist: [], reflections: [], unknownSections: [], warnings: [] };
    }
    const sections = splitSections(input);
    const warnings = [];
    let watchlist = [];
    let reflections = [];
    const unknownSections = [];
    for (const section of sections) {
        if (section.heading === WATCHLIST_HEADING) {
            watchlist = parseWatchlistLines(section.lines, warnings);
        }
        else if (section.heading === REFLECTION_HEADING) {
            reflections = parseReflectionLines(section.lines, warnings);
        }
        else {
            unknownSections.push({
                heading: section.heading,
                content: section.lines.join('\n').trim(),
            });
        }
    }
    return { watchlist, reflections, unknownSections, warnings };
}
//# sourceMappingURL=parser.js.map