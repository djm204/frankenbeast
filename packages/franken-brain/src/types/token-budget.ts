const PRESSURE_THRESHOLD = 0.85;

export class TokenBudget {
  readonly budget: number;
  readonly used: number;

  constructor(budget: number, used: number) {
    if (!Number.isInteger(budget) || budget <= 0) {
      throw new RangeError(`budget must be a positive integer, got ${budget}`);
    }
    if (!Number.isInteger(used) || used < 0) {
      throw new RangeError(`used must be a non-negative integer, got ${used}`);
    }
    this.budget = budget;
    this.used = used;
  }

  remaining(): number {
    return Math.max(0, this.budget - this.used);
  }

  isExhausted(): boolean {
    return this.used >= this.budget;
  }

  isPressured(): boolean {
    return this.used > this.budget * PRESSURE_THRESHOLD;
  }

  add(tokens: number): TokenBudget {
    return new TokenBudget(this.budget, this.used + tokens);
  }
}
