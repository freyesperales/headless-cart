import { Money } from "../money/money.js";
import type { CartItem } from "./types.js";

export interface CartTotals {
  /** Total number of units across all lines (sum of quantities). */
  itemCount: number;
  /** Distinct line items. */
  lineCount: number;
  /** Sum of `unitPrice * quantity` across all lines. */
  subtotal: Money;
}

/**
 * Compute aggregate totals. Tax / shipping / discounts are out of scope —
 * those depend on backend logic. Use this for the "subtotal" + "items in
 * cart" badges that every UI needs.
 *
 * Throws if items mix currencies (a bug in your data — fail fast).
 *
 * Pass `fallbackCurrency` to get a zero subtotal for an empty cart.
 */
export function computeTotals(
  items: readonly CartItem[],
  fallbackCurrency: string = "USD",
): CartTotals {
  let itemCount = 0;
  let subtotal: Money | null = null;

  for (const it of items) {
    itemCount += it.quantity;
    const line = it.unitPrice.multiply(it.quantity);
    subtotal = subtotal === null ? line : subtotal.add(line);
  }

  return {
    itemCount,
    lineCount: items.length,
    subtotal: subtotal ?? Money.zero(fallbackCurrency),
  };
}
