/**
 * WooCommerce Store API adapter.
 *
 * Highlights:
 * - Uses `Cart-Token` cookie to identify the cart for guest users.
 * - Uses `Nonce` header (returned on first GET) for write requests.
 * - Both are read from / written to the browser's cookies; on the server
 *   you'd typically use Next.js `cookies()` instead.
 *
 * Sketch — adapt to your auth flow:
 */
import { Money, type CartAdapter, type CartItem } from "../../src/index.js";

interface WooStoreApiItem {
  key: string;
  id: number;
  variation: Array<{ attribute: string; value: string }>;
  name: string;
  quantity: number;
  prices: {
    price: string; // e.g. "1990" (in minor units, as a string)
    currency_code: string;
    currency_minor_unit: number;
  };
  images?: Array<{ thumbnail: string }>;
}

interface WooStoreApiCart {
  items: WooStoreApiItem[];
}

function toCartItem(it: WooStoreApiItem): CartItem {
  return {
    id: it.key,
    productId: it.id,
    name: it.name,
    quantity: it.quantity,
    unitPrice: Money.of(Number(it.prices.price), {
      code: it.prices.currency_code,
      decimals: it.prices.currency_minor_unit,
    }),
    attributes: Object.fromEntries(
      it.variation.map((v) => [v.attribute, v.value]),
    ),
    imageUrl: it.images?.[0]?.thumbnail,
  };
}

export interface WooAdapterOptions {
  /** WooCommerce site root, e.g. `https://shop.example.com`. */
  siteUrl: string;
  /** Read `Cart-Token` from somewhere (cookie, session, custom store). */
  getCartToken: () => string | null;
  /** Persist `Cart-Token` after the first response. */
  setCartToken: (token: string) => void;
  /** Read `Nonce`. WooCommerce rotates this on each response. */
  getNonce: () => string | null;
  setNonce: (nonce: string) => void;
}

export function createWooAdapter(opts: WooAdapterOptions): CartAdapter {
  const base = `${opts.siteUrl.replace(/\/$/, "")}/wp-json/wc/store/v1`;

  async function request(
    path: string,
    init: RequestInit = {},
  ): Promise<WooStoreApiCart> {
    const headers = new Headers(init.headers);
    const token = opts.getCartToken();
    const nonce = opts.getNonce();
    if (token) headers.set("Cart-Token", token);
    if (nonce) headers.set("Nonce", nonce);
    headers.set("Accept", "application/json");
    if (init.body) headers.set("Content-Type", "application/json");

    const res = await fetch(`${base}${path}`, { ...init, headers });

    const newToken = res.headers.get("Cart-Token");
    const newNonce = res.headers.get("Nonce");
    if (newToken) opts.setCartToken(newToken);
    if (newNonce) opts.setNonce(newNonce);

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`WooCommerce ${res.status}: ${text}`);
    }
    return (await res.json()) as WooStoreApiCart;
  }

  return {
    async load() {
      const cart = await request("/cart");
      return cart.items.map(toCartItem);
    },
    async add(input) {
      const body: Record<string, unknown> = {
        id: input.productId,
        quantity: input.quantity,
      };
      if (input.attributes) {
        body.variation = Object.entries(input.attributes).map(
          ([attribute, value]) => ({ attribute, value }),
        );
      }
      const cart = await request("/cart/add-item", {
        method: "POST",
        body: JSON.stringify(body),
      });
      return cart.items.map(toCartItem);
    },
    async update(itemId, quantity) {
      const cart = await request("/cart/update-item", {
        method: "POST",
        body: JSON.stringify({ key: itemId, quantity }),
      });
      return cart.items.map(toCartItem);
    },
    async remove(itemId) {
      const cart = await request("/cart/remove-item", {
        method: "POST",
        body: JSON.stringify({ key: itemId }),
      });
      return cart.items.map(toCartItem);
    },
    async clear() {
      const cart = await request("/cart/items", { method: "DELETE" });
      return cart.items.map(toCartItem);
    },
  };
}
