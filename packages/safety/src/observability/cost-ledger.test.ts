import { describe, it, expect } from "vitest";
import { CostLedger } from "./cost-ledger.js";

describe("CostLedger", () => {
  it("returns 0 for an unknown session", () => {
    const ledger = new CostLedger();
    expect(ledger.getTotal("unknown")).toBe(0);
  });

  it("accumulates spend for a session across multiple calls", () => {
    const ledger = new CostLedger();
    ledger.record("session-a", 0.01);
    ledger.record("session-a", 0.02);
    expect(ledger.getTotal("session-a")).toBeCloseTo(0.03, 6);
  });

  it("tracks sessions independently", () => {
    const ledger = new CostLedger();
    ledger.record("session-a", 0.05);
    ledger.record("session-b", 0.10);
    expect(ledger.getTotal("session-a")).toBeCloseTo(0.05, 6);
    expect(ledger.getTotal("session-b")).toBeCloseTo(0.10, 6);
  });

  it("wouldExceed returns false when under ceiling", () => {
    const ledger = new CostLedger();
    ledger.record("s", 0.02);
    expect(ledger.wouldExceed("s", 0.01, 0.05)).toBe(false);
  });

  it("wouldExceed returns true when addition exceeds ceiling", () => {
    const ledger = new CostLedger();
    ledger.record("s", 0.04);
    // 0.04 + 0.02 = 0.06 > 0.05
    expect(ledger.wouldExceed("s", 0.02, 0.05)).toBe(true);
  });

  it("second call that would exceed cumulative budget is detected", () => {
    const ledger = new CostLedger();
    ledger.record("session-x", 0.04); // first call consumed $0.04
    // Second call estimates $0.02 → total would be $0.06 > $0.05 ceiling
    expect(ledger.wouldExceed("session-x", 0.02, 0.05)).toBe(true);
  });

  it("reset clears session total", () => {
    const ledger = new CostLedger();
    ledger.record("s", 0.99);
    ledger.reset("s");
    expect(ledger.getTotal("s")).toBe(0);
  });
});
