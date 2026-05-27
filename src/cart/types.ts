import type { Money } from "../money/money.js";

/**
 * A single line in the cart. Backend-agnostic — your adapter is responsible
 * for translating between this shape and your backend's response.
 */
export interface CartItem {
  /** Stable line-item ID from your backend (or a client-generated UUID). */
  id: string;
  /** Product identifier (string or number, your choice). */
  productId: string | number;
  /** Variant identifier when the product has variations. */
  variantId?: string | number;
  /** Display name shown in the cart UI. */
  name: string;
  /** Quantity ordered. Must be > 0; remove the item to reach 0. */
  quantity: number;
  /** Price for ONE unit, after any line-item discount. */
  unitPrice: Money;
  /** Selected attributes (e.g. `{ color: "red", size: "M" }`). */
  attributes?: Record<string, string>;
  /** Optional thumbnail. */
  imageUrl?: string;
  /** Anything else your app needs (slug, URL, custom fields…). */
  meta?: Record<string, unknown>;
}

/** Input to `cart.add()`. Adapter maps this to its backend call. */
export interface AddItemInput {
  productId: string | number;
  variantId?: string | number;
  quantity: number;
  attributes?: Record<string, string>;
  meta?: Record<string, unknown>;
}

/**
 * Status of the cart. `idle` = nothing in flight. `loading` = a mutation
 * or initial `load()` is running. `error` = last mutation failed; the
 * stored `error` is the cause and the cart state has been rolled back.
 */
export type CartStatus = "idle" | "loading" | "error";

export interface CartState {
  items: readonly CartItem[];
  status: CartStatus;
  error: Error | null;
}

/**
 * Implement this to plug `headless-cart` into any backend (WooCommerce
 * Store API, Shopify Storefront, Medusa, your own REST/GraphQL, etc.).
 *
 * Every method should resolve with the **complete updated cart contents**
 * as the backend sees them — `headless-cart` uses your response as the
 * source of truth and replaces the optimistic state with it on success.
 *
 * Throw on failure. The store will roll back to the pre-mutation state
 * and expose the error via `state.error`.
 */
export interface CartAdapter {
  /** Fetch the current cart on mount. Return [] if the backend has none. */
  load(): Promise<CartItem[]>;
  /** Add an item. Adapter is free to merge into an existing line. */
  add(input: AddItemInput): Promise<CartItem[]>;
  /** Update the quantity of one line item. */
  update(itemId: string, quantity: number): Promise<CartItem[]>;
  /** Remove one line item entirely. */
  remove(itemId: string): Promise<CartItem[]>;
  /** Empty the cart. Optional — falls back to removing each item. */
  clear?(): Promise<CartItem[]>;
}
