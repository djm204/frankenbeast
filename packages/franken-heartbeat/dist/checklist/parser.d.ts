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
export declare function parseChecklist(input: string): ChecklistParseResult;
//# sourceMappingURL=parser.d.ts.map