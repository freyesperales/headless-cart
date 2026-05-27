export {
  CartProvider,
  useCart,
  useCartItem,
  useCartTotals,
  type CartProviderProps,
  type UseCartResult,
} from "./cart.js";

export {
  WishlistProvider,
  useWishlist,
  useWishlistItem,
  type UseWishlistResult,
  type WishlistProviderProps,
} from "./wishlist.js";

// Re-export the framework-agnostic core so consumers can do
// `import { Money } from "headless-cart/react"`.
export {
  Money,
  CURRENCIES,
  type BuiltinCurrencyCode,
  type Currency,
} from "../money/index.js";

export {
  computeTotals,
  type AddItemInput,
  type CartAdapter,
  type CartItem,
  type CartState,
  type CartStatus,
  type CartTotals,
} from "../cart/index.js";

export type { WishlistItem } from "../wishlist/index.js";
