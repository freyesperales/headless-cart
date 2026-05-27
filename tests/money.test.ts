import { describe, expect, it } from "vitest";
import { CURRENCIES, Money } from "../src/index.js";

describe("Money construction", () => {
  it("stores minor units exactly", () => {
    expect(Money.of(1990, "CLP").amount).toBe(1990);
    expect(Money.of(1990, "USD").amount).toBe(1990); // 1990 cents = $19.90
  });

  it("converts major decimals to minor units", () => {
    expect(Money.fromMajor(19.9, "USD").amount).toBe(1990);
    expect(Money.fromMajor(1990, "CLP").amount).toBe(1990);
    expect(Money.fromMajor(0.1, "USD").amount).toBe(10);
  });

  it("rounds half-away-from-zero on fromMajor", () => {
    expect(Money.fromMajor(0.015, "USD").amount).toBe(2); // 1.5 cents → 2
    expect(Money.fromMajor(0.014, "USD").amount).toBe(1);
  });

  it("rejects non-integer minor units", () => {
    expect(() => Money.of(1.5, "USD")).toThrow(/integer/);
  });

  it("rejects non-finite amounts", () => {
    expect(() => Money.of(Number.NaN, "USD")).toThrow();
    expect(() => Money.of(Infinity, "USD")).toThrow();
  });

  it("uppercases custom currency codes and defaults to 2 decimals", () => {
    const m = Money.of(1000, "xyz");
    expect(m.currency.code).toBe("XYZ");
    expect(m.currency.decimals).toBe(2);
  });

  it("recognizes built-in zero-decimal currencies", () => {
    expect(CURRENCIES.CLP.decimals).toBe(0);
    expect(CURRENCIES.JPY.decimals).toBe(0);
    expect(CURRENCIES.USD.decimals).toBe(2);
  });
});

describe("Money math", () => {
  it("adds without precision loss", () => {
    const a = Money.fromMajor(0.1, "USD");
    const b = Money.fromMajor(0.2, "USD");
    expect(a.add(b).toMajor()).toBe(0.3); // would fail with floats
    expect(a.add(b).amount).toBe(30);
  });

  it("subtracts to zero correctly", () => {
    const a = Money.of(100, "USD");
    expect(a.subtract(a).isZero()).toBe(true);
  });

  it("multiplies for line totals", () => {
    expect(Money.of(1990, "CLP").multiply(3).amount).toBe(5970);
    expect(Money.of(1990, "USD").multiply(0.5).amount).toBe(995);
  });

  it("throws on currency mismatch", () => {
    const usd = Money.of(100, "USD");
    const clp = Money.of(100, "CLP");
    expect(() => usd.add(clp)).toThrow(/Currency mismatch/);
  });

  it("compares amounts", () => {
    const a = Money.of(100, "USD");
    const b = Money.of(200, "USD");
    expect(a.compare(b)).toBe(-1);
    expect(b.compare(a)).toBe(1);
    expect(a.compare(Money.of(100, "USD"))).toBe(0);
  });

  it("sums an iterable", () => {
    const items = [
      Money.of(100, "USD"),
      Money.of(200, "USD"),
      Money.of(50, "USD"),
    ];
    expect(Money.sum(items).amount).toBe(350);
  });

  it("sums an empty iterable with fallback currency", () => {
    expect(Money.sum([], "CLP").isZero()).toBe(true);
  });

  it("throws on empty iterable without fallback", () => {
    expect(() => Money.sum([])).toThrow();
  });
});

describe("Money formatting", () => {
  it("formats USD with two decimals", () => {
    const out = Money.of(199900, "USD").format("en-US");
    expect(out).toContain("1,999.00");
  });

  it("formats CLP with no decimals and thousand separators", () => {
    const out = Money.of(199900, "CLP").format("es-CL");
    // es-CL uses "." as thousand separator
    expect(out).toMatch(/199\.900/);
  });

  it("respects custom Intl options", () => {
    const out = Money.of(1990, "USD").format("en-US", {
      currencyDisplay: "code",
    });
    expect(out).toContain("USD");
  });
});

describe("Money JSON round-trip", () => {
  it("survives serialize/deserialize", () => {
    const a = Money.of(1990, "CLP");
    const json = JSON.parse(JSON.stringify(a)) as { amount: number; currency: string };
    const b = Money.fromJSON(json);
    expect(b.equals(a)).toBe(true);
  });
});
