# headless-cart

Backend-agnostic **cart + wishlist + money** primitives for React. Bring your own adapter — works with WooCommerce, Shopify, Medusa, Commerce Layer, or your own REST/GraphQL.

[![npm](https://img.shields.io/npm/v/headless-cart.svg)](https://www.npmjs.com/package/headless-cart)
[![license](https://img.shields.io/npm/l/headless-cart.svg)](./LICENSE)

```bash
npm install headless-cart
```

---

## Why

Every React e-commerce starter re-invents the same three things:
1. **A cart state machine** with optimistic updates and rollback.
2. **A wishlist** persisted to localStorage.
3. **Money formatting** that handles CLP-without-decimals, USD-with-cents, EUR-with-comma, etc.

Headless backends (Shopify Hydrogen, Medusa React, Commerce Layer's SDK, swell-react) lock you into one vendor. `headless-cart` is the opposite: tiny, vendor-neutral, and you write a ~30-line adapter for whatever backend you actually use.

**Not included**: checkout, tax, shipping, payment. Those are backend-specific. This library handles the in-browser state.

---

## Quickstart

```tsx
// app/providers.tsx
"use client";
import { CartProvider, WishlistProvider } from "headless-cart/react";
import { myAdapter } from "./my-adapter";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider adapter={myAdapter}>
      <WishlistProvider>{children}</WishlistProvider>
    </CartProvider>
  );
}
```

```tsx
// app/product/[slug]/AddToCartButton.tsx
"use client";
import { useCart } from "headless-cart/react";

export function AddToCartButton({ productId }: { productId: number }) {
  const { addItem, status } = useCart();
  return (
    <button
      disabled={status === "loading"}
      onClick={() => addItem({ productId, quantity: 1 })}
    >
      {status === "loading" ? "Adding…" : "Add to cart"}
    </button>
  );
}
```

```tsx
// app/components/CartBadge.tsx
"use client";
import { useCartTotals } from "headless-cart/react";

export function CartBadge() {
  const { itemCount, subtotal } = useCartTotals();
  return (
    <span>
      🛒 {itemCount} — {subtotal.format("en-US")}
    </span>
  );
}
```

That's it. The cart updates optimistically; if the adapter call fails the state rolls back automatically.

---

## The adapter contract

You implement these four (plus optional `clear`):

```ts
import type { CartAdapter, CartItem } from "headless-cart";

export const myAdapter: CartAdapter = {
  async load(): Promise<CartItem[]> { /* ... */ },
  async add(input):  Promise<CartItem[]> { /* ... */ },
  async update(itemId, quantity): Promise<CartItem[]> { /* ... */ },
  async remove(itemId): Promise<CartItem[]> { /* ... */ },
  async clear?(): Promise<CartItem[]> { /* ... */ },
};
```

Every method **returns the complete cart**, not a diff. `headless-cart` uses that response as the source of truth and replaces the optimistic state with it on success.

See `examples/adapters/` for working implementations:
- [`woo-store-api.ts`](./examples/adapters/woo-store-api.ts) — WooCommerce Store API with Cart-Token cookie
- [`shopify-storefront.ts`](./examples/adapters/shopify-storefront.ts) — Shopify Storefront GraphQL
- [`in-memory.ts`](./examples/adapters/in-memory.ts) — useful for tests / Storybook

---

## Money

```ts
import { Money } from "headless-cart";

// Construct from minor units (cents, pesos, etc.)
Money.of(1990, "USD");     // $19.90
Money.of(1990, "CLP");     // CLP 1.990 (no decimals)

// Or from a major-unit decimal
Money.fromMajor(19.90, "USD"); // → 1990 cents

// Math (no float bugs)
Money.fromMajor(0.1, "USD").add(Money.fromMajor(0.2, "USD")).toMajor(); // 0.3, not 0.30000000000000004

// Format (Intl-aware)
Money.of(199900, "USD").format("en-US"); // "$1,999.00"
Money.of(199900, "CLP").format("es-CL"); // "$199.900"
Money.of(199900, "EUR").format("de-DE"); // "1.999,00 €"
```

Currencies with built-in `decimals` info: **CLP, ARS, BRL, COP, EUR, GBP, JPY, KRW, MXN, PEN, UYU, USD**. Any other ISO 4217 code works — assumed 2 decimals; pass a `Currency` object to override.

---

## Wishlist

```tsx
"use client";
import { useWishlistItem } from "headless-cart/react";

function HeartButton({ productId }: { productId: number }) {
  const { isInWishlist, toggle } = useWishlistItem(productId);
  return (
    <button onClick={toggle} aria-label="Save">
      {isInWishlist ? "❤️" : "🤍"}
    </button>
  );
}
```

Defaults to `localStorage`. Pass `<WishlistProvider storage={null}>` for in-memory only, or implement `WishlistStorage` for a server-backed wishlist tied to a user.

`useWishlistItem` only re-renders when **that specific item** is toggled — heart icons across a 60-product grid don't all re-render when one changes.

---

## SSR / Next.js App Router

The Providers are client components. Mount them in a `"use client"` boundary near your root layout:

```tsx
// app/layout.tsx
import { Providers } from "./providers";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

If you have cart contents from RSC, pass them via `initialItems` to skip the load fetch on hydration:

```tsx
<CartProvider adapter={myAdapter} initialItems={serverItems} autoLoad={false}>
```

---

## API surface

### `headless-cart`

| Export | What |
|---|---|
| `Money` | Currency-safe amount, math, formatting |
| `CURRENCIES`, `resolveCurrency` | Built-in currency definitions |
| `CartStore` | Framework-agnostic cart (use the React hooks unless you need this directly) |
| `CartAdapter`, `CartItem`, `AddItemInput`, `CartState` | Types |
| `computeTotals` | Pure function: items → `{ itemCount, lineCount, subtotal }` |
| `WishlistStore` | Framework-agnostic wishlist |

### `headless-cart/react`

| Export | What |
|---|---|
| `CartProvider` | Owns one `CartStore` instance |
| `useCart()` | State + bound mutation helpers |
| `useCartItem(id)` | One line, isolated re-render |
| `useCartTotals()` | Memoized totals |
| `WishlistProvider` | Owns one `WishlistStore` instance |
| `useWishlist()` | All items + helpers |
| `useWishlistItem(productId, variantId?)` | One product, isolated re-render |

---

## Optimistic updates: how they work

```
user click
    │
    ├─▶ apply optimistic patch to state (synchronous, UI updates immediately)
    │
    ├─▶ queue adapter call (serial — runs after any in-flight mutation)
    │
    ├─▶ on success: state = adapter response (source of truth)
    └─▶ on error:   state = pre-mutation snapshot, status = "error"
```

Mutations are **serialized** to avoid races. If the user clicks "add" three times in 100ms, all three optimistic updates apply instantly, and the three adapter calls run one after the other in order.

---

## What this is NOT

- **Not a payment SDK.** See [`webpay-next`](https://github.com/freyesperales/webpay-next) for Transbank, or any provider's own SDK.
- **Not a checkout flow.** Adapter responses are the cart only.
- **Not server state.** For SSR/RSC fetching, use your framework's tools (Next.js cache, RSC, TanStack Query).
- **Not opinionated UI.** Bring your own components.

---

## License

[MIT](./LICENSE) © Francisco Reyes
