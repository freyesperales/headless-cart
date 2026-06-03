# headless-cart

> Backend-agnostic **cart + wishlist + money** primitives for React. Bring your own adapter.

Tiny, vendor-neutral primitives for the parts of e-commerce every team rewrites: an optimistic cart state machine, a per-user wishlist, and a `Money` type that doesn't break on CLP, JPY, or EUR-with-commas. Works with WooCommerce, Shopify, Medusa, Commerce Layer, or your own REST/GraphQL — you write a ~30-line adapter.

[![npm](https://img.shields.io/npm/v/headless-cart.svg)](https://www.npmjs.com/package/headless-cart)
[![license](https://img.shields.io/npm/l/headless-cart.svg)](./LICENSE)
[![bundle](https://img.shields.io/badge/bundle-12KB%20core%20%2B%2016KB%20react-blue)](./dist)

---

## Why headless-cart

| | Shopify Hydrogen | Medusa React | commerce.js | **headless-cart** |
|---|---|---|---|---|
| Backend coupling | Shopify only | Medusa only | Chec only | **Any** (you write the adapter) |
| Optimistic updates with rollback | Manual | Partial | No | **Yes, built-in** |
| Currency-correct `Money` (CLP/JPY/etc.) | Shopify-shaped | No | No | **Yes** |
| Wishlist | No | No | No | **Yes (localStorage by default)** |
| Bundle (`react` subpath, min+gz est.) | ~50 KB+ | ~40 KB+ | ~30 KB | **~16 KB** |
| Re-renders 60 hearts when one toggles | n/a | n/a | n/a | **No** — `useWishlistItem` isolates |
| React version | 18+ | 18+ | 16+ | **18 / 19** |

Honest disclaimers:
- Hydrogen and Medusa React ship far more than this — checkout flows, account, search, image components. If you're committed to one of those backends, take theirs.
- This library does **not** handle payment, tax, shipping, address validation, or server-side cart syncing strategy. It manages browser-side state and talks to whatever adapter you write.

---

## Install

```bash
npm install headless-cart
# or
pnpm add headless-cart
# or
bun add headless-cart
# or
yarn add headless-cart
```

- **Node:** 18.17+ (for tooling — runs in the browser)
- **React (peer dep, optional):** 18 or 19 — only required if you use `headless-cart/react`
- **Module formats:** ESM + CJS dual export, full `.d.ts` typings
- **Runtime deps:** none

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
  return <span>{itemCount} — {subtotal.format("en-US")}</span>;
}
```

The cart updates optimistically. If the adapter call fails the state rolls back automatically and `state.error` is set.

---

## Recipes

### Build a WooCommerce adapter (Cart-Token cookies)

```ts
import type { CartAdapter, CartItem } from "headless-cart";
import { Money } from "headless-cart";

const BASE = process.env.NEXT_PUBLIC_WP_URL!;

// Cart-Token + Nonce are headers Woo Store API returns and expects back.
let cartToken: string | null = null;
let nonce: string | null = null;

async function call(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}/wp-json/wc/store/v1/${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(cartToken ? { "Cart-Token": cartToken } : {}),
      ...(nonce ? { "Nonce": nonce } : {}),
      ...(init?.headers ?? {}),
    },
    credentials: "include",
  });
  cartToken = res.headers.get("Cart-Token") ?? cartToken;
  nonce = res.headers.get("Nonce") ?? nonce;
  if (!res.ok) throw new Error(`Woo ${path}: ${res.status}`);
  const json = await res.json();
  return wooItems(json);
}

function wooItems(cart: any): CartItem[] {
  return (cart.items ?? []).map((it: any) => ({
    id: String(it.key),
    productId: it.id,
    variantId: it.variation?.length ? it.variation : undefined,
    name: it.name,
    quantity: it.quantity,
    unitPrice: Money.of(Number(it.prices.price), it.prices.currency_code),
    image: it.images?.[0]?.src,
  }));
}

export const wooAdapter: CartAdapter = {
  load: () => call("cart"),
  add: ({ productId, quantity, variantId }) =>
    call("cart/add-item", { method: "POST", body: JSON.stringify({ id: productId, quantity, variation: variantId }) }),
  update: (itemId, quantity) =>
    call("cart/update-item", { method: "POST", body: JSON.stringify({ key: itemId, quantity }) }),
  remove: (itemId) =>
    call("cart/remove-item", { method: "POST", body: JSON.stringify({ key: itemId }) }),
};
```

See [`examples/adapters/woo-store-api.ts`](./examples/adapters/woo-store-api.ts) for a more complete version with httpOnly cookies via server actions.

### Persist cart state across reloads without a backend

```tsx
"use client";
import { useEffect, useState } from "react";
import { CartProvider } from "headless-cart/react";
import type { CartItem } from "headless-cart";
import { myAdapter } from "./my-adapter";

export function PersistedCartProvider({ children }: { children: React.ReactNode }) {
  const [initial, setInitial] = useState<CartItem[] | undefined>();

  useEffect(() => {
    const raw = localStorage.getItem("cart");
    setInitial(raw ? JSON.parse(raw) : []);
  }, []);

  if (!initial) return null; // hydrate gate

  return (
    <CartProvider
      adapter={myAdapter}
      initialItems={initial}
      autoLoad={false}
      onChange={(state) => localStorage.setItem("cart", JSON.stringify(state.items))}
    >
      {children}
    </CartProvider>
  );
}
```

For a real Woo / Shopify cart, prefer the server's cart token over localStorage so multi-device users stay in sync.

### Optimistic-with-rollback for free

```tsx
const { addItem, state } = useCart();

await addItem({ productId: 2169, quantity: 1 });

if (state.status === "error") {
  toast.error(state.error?.message ?? "Couldn't add to cart");
  // No need to revert the UI — the store already did.
}
```

How it works:

1. Optimistic patch applies synchronously — UI updates immediately.
2. Adapter call is queued (serial — never two in flight).
3. On success: adapter response replaces optimistic state (server is truth).
4. On error: state rolls back to the pre-mutation snapshot and `state.error` is set.

### Server-render the cart from RSC (Next.js App Router)

```tsx
// app/layout.tsx (Server Component)
import { Providers } from "./providers";
import { fetchInitialCart } from "@/lib/cart-server";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const initial = await fetchInitialCart(); // your server-side fetch
  return (
    <html lang="en">
      <body>
        <Providers initial={initial}>{children}</Providers>
      </body>
    </html>
  );
}
```

```tsx
// app/providers.tsx
"use client";
export function Providers({ initial, children }: { initial: CartItem[]; children: React.ReactNode }) {
  return (
    <CartProvider adapter={myAdapter} initialItems={initial} autoLoad={false}>
      <WishlistProvider>{children}</WishlistProvider>
    </CartProvider>
  );
}
```

`autoLoad={false}` skips the initial fetch on hydration since the RSC already supplied the items.

### Wishlist heart that doesn't re-render the whole grid

```tsx
"use client";
import { useWishlistItem } from "headless-cart/react";

export function HeartButton({ productId }: { productId: number }) {
  const { isInWishlist, toggle } = useWishlistItem(productId);
  return (
    <button onClick={toggle} aria-label="Save">
      {isInWishlist ? "♥" : "♡"}
    </button>
  );
}
```

`useWishlistItem(id)` subscribes only to **that** product's slice. Toggling one heart in a 60-product grid does not re-render the other 59.

---

## Money

```ts
import { Money } from "headless-cart";

Money.of(1990, "USD");          // $19.90 (1990 cents)
Money.of(1990, "CLP");          // CLP 1.990 (1990 pesos, no decimals)
Money.fromMajor(19.90, "USD");  // 1990 cents — float-safe parser

// Math is integer-safe under the hood
Money.fromMajor(0.1, "USD").add(Money.fromMajor(0.2, "USD")).toMajor();
// → 0.3 (not 0.30000000000000004)

Money.of(199900, "USD").format("en-US");  // "$1,999.00"
Money.of(199900, "CLP").format("es-CL");  // "$199.900"
Money.of(199900, "EUR").format("de-DE");  // "1.999,00 €"
```

Built-in zero-decimal handling for **CLP, JPY, KRW**. Built-in currencies: **CLP, ARS, BRL, COP, EUR, GBP, JPY, KRW, MXN, PEN, UYU, USD**. Any other ISO 4217 code works (assumed 2 decimals) — pass a `Currency` object to override.

---

## The adapter contract

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

Every method **returns the complete cart**, not a diff. The store uses that response as the source of truth and replaces the optimistic state with it on success.

Working examples in `examples/adapters/`:
- `woo-store-api.ts` — WooCommerce Store API with Cart-Token cookie
- `shopify-storefront.ts` — Shopify Storefront GraphQL
- `in-memory.ts` — for tests / Storybook

---

## API reference

### `headless-cart`

| Export | What |
|---|---|
| `Money` | Currency-safe amount, math, formatting |
| `CURRENCIES`, `resolveCurrency` | Built-in currency definitions |
| `CartStore` | Framework-agnostic cart store (use React hooks unless you need direct access) |
| `WishlistStore` | Framework-agnostic wishlist store |
| `computeTotals` | Pure `items → { itemCount, lineCount, subtotal }` |
| `CartAdapter`, `CartItem`, `AddItemInput`, `CartState`, `Currency` | Types |

### `headless-cart/react`

| Export | What |
|---|---|
| `CartProvider` | Owns one `CartStore` instance |
| `useCart()` | State + bound mutation helpers (`addItem`, `updateItem`, `removeItem`, `clear`) |
| `useCartItem(id)` | One line item, isolated re-render |
| `useCartTotals()` | Memoized `{ itemCount, lineCount, subtotal }` |
| `WishlistProvider` | Owns one `WishlistStore` instance |
| `useWishlist()` | All items + helpers |
| `useWishlistItem(productId, variantId?)` | One product, isolated re-render |

---

## SSR / Next.js notes

The providers are client components — mount them inside a `"use client"` boundary near your root layout. The stores themselves never touch `window` until they're inside `useEffect`, so SSR rendering of children works fine.

If you have cart contents available from RSC, pass them via `initialItems` and set `autoLoad={false}` to skip the load-fetch round-trip on hydration.

---

## Troubleshooting / FAQ

**Why does the cart flash empty on first paint?**
You're letting the client adapter run `load()` on mount. Use `initialItems` from RSC or hydrate from localStorage before mounting the provider (see the persisted-cart recipe).

**My adapter returns prices as strings — what do I do?**
Parse them in your adapter: `Money.of(Number(price), "USD")`. Keep the adapter as the boundary that translates backend shapes into `CartItem`.

**Does it work in React Server Components?**
The `react` subpath is **client-only** — hooks need state. The core (`headless-cart`) is universal — you can build `CartStore` instances on the server too, but they won't observe browser storage.

**Can I have two carts on the same page (e.g. "save for later")?**
Yes. Mount two `<CartProvider>` with different adapters. The hooks find the nearest provider — wrap each section accordingly.

**My optimistic update gets overwritten by a stale `load()`.**
`load()` is idempotent by default — second calls become no-ops. Pass `force: true` only when you really want to overwrite local state.

**Bundle size — is it really 16 KB?**
`headless-cart/react` ESM is ~15.8 KB unminified. Core is ~12 KB. Most of that is the `Money` formatter (Intl is free at runtime, the registry of currency metadata is small). Gzipped you're under 6 KB total.

**Does it support React 19's `useOptimistic` / `useFormStatus`?**
You don't need them — the store already handles optimistic + rollback. You can still wrap mutations in `useTransition` for pending UI if you prefer that pattern.

**How do I clear the cart on logout?**
Call `clear()` (if your adapter implements it) or remount the provider with a fresh `key` prop on `<CartProvider>`.

**Are wishlist items synced across devices?**
Default storage is `localStorage` — single device. Pass `<WishlistProvider storage={yourServerStorage}>` implementing the `WishlistStorage` interface to back it with your user account.

**Does this handle taxes or shipping?**
No. Those are backend-specific and per-jurisdiction. Compute them server-side in your checkout flow.

---

## Versioning

[semver](https://semver.org). Until 1.0:
- **Patch** (`0.1.x`) — bug fixes, doc tweaks.
- **Minor** (`0.x.0`) — additive APIs; well-flagged breaking changes possible pre-1.0.
- **Major** (`1.0.0`) — first stability commitment.

See [CHANGELOG.md](./CHANGELOG.md).

---

## What this is NOT

- **Not a payment SDK.** See [`webpay-next`](https://github.com/freyesperales/webpay-next) for Transbank, or any provider's own SDK.
- **Not a checkout flow.** Adapter responses describe the cart only.
- **Not server state.** For SSR/RSC fetching use your framework's tools (Next.js cache, TanStack Query, etc.).
- **Not opinionated UI.** Bring your own components.

---

## Roadmap

- [x] Cart store with optimistic + rollback
- [x] Wishlist with `localStorage` persistence
- [x] `Money` with Intl-aware formatting
- [ ] Reference Medusa + Commerce Layer adapters
- [ ] Optional Zod schemas for adapter responses
- [ ] `useCartLine(id)` selector with stable item identity (in-flight v0.2)
- [ ] Telemetry hook (`onMutation: (op, state) => ...`) for analytics
- [ ] React Native build (no localStorage assumption)

---

## Contributing

PRs welcome:

1. Open an issue first for non-trivial changes.
2. `npm test && npm run typecheck` must pass.
3. Conventional commits preferred (`feat:`, `fix:`, `chore:`, `docs:`).
4. Update [`CHANGELOG.md`](./CHANGELOG.md) under `## Unreleased`.

Local dev:

```bash
git clone https://github.com/freyesperales/headless-cart
cd headless-cart
npm install
npm test
npm run build   # tsup → dist/
```

---

## License

[MIT](./LICENSE) © Francisco Reyes
