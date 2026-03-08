function formatWatchlistSection(items) {
    if (items.length === 0)
        return '';
    const lines = items.map((item) => {
        const checkbox = item.checked ? '[x]' : '[ ]';
        return `- ${checkbox} ${item.description}`;
    });
    return `## Active Watchlist\n${lines.join('\n')}`;
}
function formatReflectionSection(entries) {
    if (entries.length === 0)
        return '';
    const lines = entries.map((entry) => `- *${entry.label}:* ${entry.content}`);
    return `## Reflection Log\n${lines.join('\n')}`;
}
function formatUnknownSection(section) {
    return `## ${section.heading}\n${section.content}`;
}
export function writeChecklist(input) {
    const sections = [];
    const watchlist = formatWatchlistSection(input.watchlist);
    if (watchlist)
        sections.push(watchlist);
    for (const section of input.unknownSections) {
        sections.push(formatUnknownSection(section));
    }
    const reflections = formatReflectionSection(input.reflections);
    if (reflections)
        sections.push(reflections);
    return sections.join('\n\n') + (sections.length > 0 ? '\n' : '');
}
//# sourceMappingURL=writer.js.map