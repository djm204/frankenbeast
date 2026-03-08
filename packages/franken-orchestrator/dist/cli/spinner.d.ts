export interface SpinnerOptions {
    write?: (text: string) => void;
    silent?: boolean;
}
export declare class Spinner {
    private readonly write;
    private readonly silent;
    private interval;
    private frameIdx;
    private label;
    private startMs;
    constructor(options?: SpinnerOptions);
    start(label: string): void;
    stop(finalMessage?: string): void;
    elapsed(): number;
    private render;
}
//# sourceMappingURL=spinner.d.ts.map