const PRESSURE_THRESHOLD = 0.85;
export class TokenBudget {
    budget;
    used;
    constructor(budget, used) {
        if (!Number.isInteger(budget) || budget <= 0) {
            throw new RangeError(`budget must be a positive integer, got ${budget}`);
        }
        if (!Number.isInteger(used) || used < 0) {
            throw new RangeError(`used must be a non-negative integer, got ${used}`);
        }
        this.budget = budget;
        this.used = used;
    }
    remaining() {
        return Math.max(0, this.budget - this.used);
    }
    isExhausted() {
        return this.used >= this.budget;
    }
    isPressured() {
        return this.used > this.budget * PRESSURE_THRESHOLD;
    }
    add(tokens) {
        return new TokenBudget(this.budget, this.used + tokens);
    }
}
//# sourceMappingURL=token-budget.js.map