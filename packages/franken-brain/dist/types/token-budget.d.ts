export declare class TokenBudget {
    readonly budget: number;
    readonly used: number;
    constructor(budget: number, used: number);
    remaining(): number;
    isExhausted(): boolean;
    isPressured(): boolean;
    add(tokens: number): TokenBudget;
}
//# sourceMappingURL=token-budget.d.ts.map