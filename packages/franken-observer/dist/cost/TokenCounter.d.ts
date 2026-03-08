export interface TokenRecord {
    model: string;
    promptTokens: number;
    completionTokens: number;
}
export interface TokenTotals {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}
export declare class TokenCounter {
    private readonly counts;
    record(entry: TokenRecord): void;
    totalsFor(model: string): TokenTotals;
    grandTotal(): TokenTotals;
    allModels(): string[];
    reset(): void;
}
//# sourceMappingURL=TokenCounter.d.ts.map