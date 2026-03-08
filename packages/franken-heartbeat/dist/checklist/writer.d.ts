import type { WatchlistItem, ReflectionEntry, UnknownSection } from './parser.js';
export interface WriteChecklistInput {
    readonly watchlist: readonly WatchlistItem[];
    readonly reflections: readonly ReflectionEntry[];
    readonly unknownSections: readonly UnknownSection[];
}
export declare function writeChecklist(input: WriteChecklistInput): string;
//# sourceMappingURL=writer.d.ts.map