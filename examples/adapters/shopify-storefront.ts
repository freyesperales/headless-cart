/**
 * Shopify Storefront API (GraphQL) adapter.
 *
 * Stores the cart ID locally (you choose where) — Shopify carts are
 * persistent and identified by an opaque GID. The adapter creates a
 * cart on first `add()` if none exists.
 */
import { Money, type CartAdapter, type CartItem } from "../../src/index.js";

interface ShopifyLine {
  id: string;
  quantity: number;
  merchandise: {
    id: string;
    title: string;
    product: { id: string; handle: string; title: string };
    image?: { url: string };
  };
  cost: {
    totalAmount: { amount: string; currencyCode: string };
    amountPerQuantity: { amount: string; currencyCode: string };
  };
}

interface ShopifyCart {
  id: string;
  lines: { nodes: ShopifyLine[] };
}

function lineToItem(l: ShopifyLine): CartItem {
  return {
    id: l.id,
    productId: l.merchandise.product.id,
    variantId: l.merchandise.id,
    name: `${l.merchandise.product.title} — ${l.merchandise.title}`,
    quantity: l.quantity,
    unitPrice: Money.fromMajor(
      Number(l.cost.amountPerQuantity.amount),
      l.cost.amountPerQuantity.currencyCode,
    ),
    imageUrl: l.merchandise.image?.url,
  };
}

export interface ShopifyAdapterOptions {
  storeDomain: string; // e.g. "myshop.myshopify.com"
  publicAccessToken: string;
  getCartId: () => string | null;
  setCartId: (id: string) => void;
}

const CART_FIELDS = /* GraphQL */ `
  fragment CartFields on Cart {
    id
    lines(first: 250) {
      nodes {
        id
        quantity
        merchandise {
          ... on ProductVariant {
            id
            title
            product { id handle title }
            image { url }
          }
        }
        cost {
          totalAmount { amount currencyCode }
          amountPerQuantity { amount currencyCode }
        }
      }
    }
  }
`;

export function createShopifyAdapter(opts: ShopifyAdapterOptions): CartAdapter {
  const endpoint = `https://${opts.storeDomain}/api/2024-10/graphql.json`;

  async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": opts.publicAccessToken,
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) throw new Error(`Shopify ${res.status}`);
    const json = (await res.json()) as { data?: T; errors?: unknown[] };
    if (json.errors?.length) throw new Error(JSON.stringify(json.errors));
    if (!json.data) throw new Error("No data");
    return json.data;
  }

  async function ensureCart(): Promise<string> {
    const existing = opts.getCartId();
    if (existing) return existing;
    const data = await gql<{ cartCreate: { cart: ShopifyCart } }>(
      `${CART_FIELDS}
       mutation { cartCreate { cart { ...CartFields } } }`,
      {},
    );
    opts.setCartId(data.cartCreate.cart.id);
    return data.cartCreate.cart.id;
  }

  return {
    async load() {
      const id = opts.getCartId();
      if (!id) return [];
      const data = await gql<{ cart: ShopifyCart | null }>(
        `${CART_FIELDS} query ($id: ID!) { cart(id: $id) { ...CartFields } }`,
        { id },
      );
      return data.cart?.lines.nodes.map(lineToItem) ?? [];
    },
    async add(input) {
      const id = await ensureCart();
      const data = await gql<{ cartLinesAdd: { cart: ShopifyCart } }>(
        `${CART_FIELDS}
         mutation ($id: ID!, $lines: [CartLineInput!]!) {
           cartLinesAdd(cartId: $id, lines: $lines) { cart { ...CartFields } }
         }`,
        {
          id,
          lines: [
            { merchandiseId: input.variantId ?? input.productId, quantity: input.quantity },
          ],
        },
      );
      return data.cartLinesAdd.cart.lines.nodes.map(lineToItem);
    },
    async update(itemId, quantity) {
      const id = await ensureCart();
      const data = await gql<{ cartLinesUpdate: { cart: ShopifyCart } }>(
        `${CART_FIELDS}
         mutation ($id: ID!, $lines: [CartLineUpdateInput!]!) {
           cartLinesUpdate(cartId: $id, lines: $lines) { cart { ...CartFields } }
         }`,
        { id, lines: [{ id: itemId, quantity }] },
      );
      return data.cartLinesUpdate.cart.lines.nodes.map(lineToItem);
    },
    async remove(itemId) {
      const id = await ensureCart();
      const data = await gql<{ cartLinesRemove: { cart: ShopifyCart } }>(
        `${CART_FIELDS}
         mutation ($id: ID!, $lineIds: [ID!]!) {
           cartLinesRemove(cartId: $id, lineIds: $lineIds) { cart { ...CartFields } }
         }`,
        { id, lineIds: [itemId] },
      );
      return data.cartLinesRemove.cart.lines.nodes.map(lineToItem);
    },
  };
}
