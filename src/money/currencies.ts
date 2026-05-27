/**
 * Currency definition.
 *
 * `decimals` is the number of minor units per major unit:
 * - 0 for CLP, JPY, KRW (no cents)
 * - 2 for USD, EUR, BRL, MXN, ARS, PEN, COP (cents)
 * - 3 for BHD, KWD (mils)
 */
export interface Currency {
  /** ISO 4217 code, uppercased (e.g. "USD"). */
  code: string;
  /** Number of decimal places used by this currency. */
  decimals: number;
}

/**
 * Built-in currencies. You can pass any ISO 4217 string to `Money` and it
 * will work — these are just shortcuts with the right `decimals`.
 */
export const CURRENCIES = {
  CLP: { code: "CLP", decimals: 0 },
  ARS: { code: "ARS", decimals: 2 },
  BRL: { code: "BRL", decimals: 2 },
  COP: { code: "COP", decimals: 2 },
  EUR: { code: "EUR", decimals: 2 },
  GBP: { code: "GBP", decimals: 2 },
  JPY: { code: "JPY", decimals: 0 },
  KRW: { code: "KRW", decimals: 0 },
  MXN: { code: "MXN", decimals: 2 },
  PEN: { code: "PEN", decimals: 2 },
  UYU: { code: "UYU", decimals: 2 },
  USD: { code: "USD", decimals: 2 },
} as const satisfies Record<string, Currency>;

export type BuiltinCurrencyCode = keyof typeof CURRENCIES;

/** Resolve a currency code or full Currency object to a Currency. */
export function resolveCurrency(input: Currency | string): Currency {
  if (typeof input === "string") {
    const upper = input.toUpperCase();
    if (upper in CURRENCIES) {
      return CURRENCIES[upper as BuiltinCurrencyCode];
    }
    // Fallback: assume 2 decimals (the most common). Caller can pass a
    // full Currency object to override.
    return { code: upper, decimals: 2 };
  }
  return input;
}
