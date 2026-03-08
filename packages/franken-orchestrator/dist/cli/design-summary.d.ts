export interface DesignSummary {
    title: string;
    sectionCount: number;
    blurb: string;
}
export interface DesignCardOptions extends DesignSummary {
    filePath: string;
}
export declare function extractDesignSummary(markdown: string): DesignSummary;
export declare function formatDesignCard(opts: DesignCardOptions): string;
//# sourceMappingURL=design-summary.d.ts.map