import { resolveCurrency, type Currency } from "./currencies.js";

/**
 * An amount of money in a specific currency.
 *
 * Stored internally as an integer in the currency's **minor units**
 * (e.g. cents for USD, pesos for CLP). This avoids float-precision bugs
 * — `0.1 + 0.2` issues never reach your totals.
 *
 * ```ts
 * const a = Money.of(1990, "CLP");      // 1990 pesos (CLP has 0 decimals)
 * const b = Money.fromMajor(19.90, "USD"); // 1990 cents = $19.90
 *
 * a.add(Money.of(100, "CLP")).format("es-CL"); // "$2.090"
 * b.multiply(3).format("en-US");                // "$59.70"
 * ```
 */
export class Money {
  /** Integer amount in minor units (cents, mills, etc.). */
  readonly amount: number;
  readonly currency: Currency;

  private constructor(amount: number, currency: Currency) {
    if (!Number.isFinite(amount)) {
      throw new RangeError(
        `Money amount must be finite, got ${String(amount)}`,
      );
    }
    if (!Number.isInteger(amount)) {
      throw new RangeError(
        `Money amount must be an integer (minor units); got ${amount}. Use Money.fromMajor() for decimal input.`,
      );
    }
    this.amount = amount;
    this.currency = currency;
  }

  /**
   * Construct from minor units (cents). The most explicit, allocation-free
   * constructor — use this when your backend already gives you cents.
   */
  static of(minor: number, currency: Currency | string): Money {
    return new Money(minor, resolveCurrency(currency));
  }

  /**
   * Construct from a major-unit decimal (`19.90` USD). Rounds to the
   * currency's `decimals` using banker's rounding (`Math.round` semantics
   * for positives — half-away-from-zero).
   *
   * Prefer `Money.of()` when your data is already in minor units; this
   * variant exists for sources that return human-readable decimals.
   */
  static fromMajor(major: number, currency: Currency | string): Money {
    const c = resolveCurrency(currency);
    const factor = Math.pow(10, c.decimals);
    // Round to nearest minor unit. Using `+ 0.5` would bias toward positive;
    // Math.round handles standard half-up for positives, half-down for negatives.
    const minor = Math.round(major * factor);
    return new Money(minor, c);
  }

  /** Convenience: zero amount in the given currency. */
  static zero(currency: Currency | string): Money {
    return new Money(0, resolveCurrency(currency));
  }

  /** Value as a decimal in major units (use for display only — may lose precision). */
  toMajor(): number {
    return this.amount / Math.pow(10, this.currency.decimals);
  }

  add(other: Money): Money {
    this.#assertSameCurrency(other);
    return new Money(this.amount + other.amount, this.currency);
  }

  subtract(other: Money): Money {
    this.#assertSameCurrency(other);
    return new Money(this.amount - other.amount, this.currency);
  }

  /** Multiply by an integer or float quantity (e.g. cart line quantity). */
  multiply(factor: number): Money {
    if (!Number.isFinite(factor)) {
      throw new RangeError("multiply factor must be finite");
    }
    return new Money(Math.round(this.amount * factor), this.currency);
  }

  /** True if amount is exactly zero. */
  isZero(): boolean {
    return this.amount === 0;
  }

  /** True if amount is strictly positive. */
  isPositive(): boolean {
    return this.amount > 0;
  }

  /** True if amount is strictly negative. */
  isNegative(): boolean {
    return this.amount < 0;
  }

  /** Compare two amounts in the same currency. Returns -1, 0, or 1. */
  compare(other: Money): -1 | 0 | 1 {
    this.#assertSameCurrency(other);
    return this.amount < other.amount ? -1 : this.amount > other.amount ? 1 : 0;
  }

  equals(other: Money): boolean {
    return (
      this.currency.code === other.currency.code &&
      this.amount === other.amount
    );
  }

  /**
   * Format using `Intl.NumberFormat`. Examples:
   *
   * ```ts
   * Money.of(199900, "USD").format("en-US"); // "$1,999.00"
   * Money.of(1990, "CLP").format("es-CL");   // "$1.990"
   * Money.of(2500, "EUR").format("de-DE");   // "25,00 €"
   * ```
   *
   * Pass extra `Intl.NumberFormatOptions` to override (e.g. hide decimals).
   */
  format(
    locale?: string | string[],
    options?: Intl.NumberFormatOptions,
  ): string {
    const fmt = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: this.currency.code,
      minimumFractionDigits: this.currency.decimals,
      maximumFractionDigits: this.currency.decimals,
      ...options,
    });
    return fmt.format(this.toMajor());
  }

  /** Serializable form, easy to send over the wire. */
  toJSON(): { amount: number; currency: string } {
    return { amount: this.amount, currency: this.currency.code };
  }

  /** Inverse of `toJSON`. */
  static fromJSON(json: { amount: number; currency: string }): Money {
    return Money.of(json.amount, json.currency);
  }

  /** Sum any iterable of Money. Throws on currency mismatch. Returns zero if empty. */
  static sum(items: Iterable<Money>, currency?: Currency | string): Money {
    let total: Money | null = null;
    for (const m of items) {
      total = total === null ? m : total.add(m);
    }
    if (total !== null) return total;
    if (currency) return Money.zero(currency);
    throw new RangeError(
      "Money.sum() of an empty iterable requires a `currency` fallback",
    );
  }

  #assertSameCurrency(other: Money): void {
    if (this.currency.code !== other.currency.code) {
      throw new TypeError(
        `Currency mismatch: ${this.currency.code} vs ${other.currency.code}`,
      );
    }
  }
}
